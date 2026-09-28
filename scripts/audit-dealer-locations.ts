import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchPinBoundaries } from "../lib/pin-boundary-service.ts";
import { pointInPinFeature, pointInsidePinFeature, type PinFeature } from "../lib/dealer-geography.ts";
import { normalizeIndianState } from "../lib/indian-states.ts";
import { validatePostalDetails, type PostalDirectory } from "../lib/postal-validation.ts";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");
const sql = neon(url);
const directory = JSON.parse(await readFile(join(process.cwd(), "public/data/postal-directory-ap-ts.json"), "utf8")) as PostalDirectory;
const regionData = JSON.parse(await readFile(join(process.cwd(), "public/region-boundaries.geojson"), "utf8")) as {
  features: Array<PinFeature & { properties: { displayName?: string } }>;
};
const stateOutlines = new Map(regionData.features.map((feature) => [feature.properties.displayName, feature]));
const rows = await sql.query(`
  SELECT id, name, pincode, area, state::text, latitude, longitude,
         location_precision, validation_status, review_note
  FROM dealers ORDER BY id
`) as Array<{
  id: number; name: string; pincode: string; area: string; state: string;
  latitude: number; longitude: number; location_precision: string;
  validation_status: string; review_note: string | null;
}>;
const boundaries = await fetchPinBoundaries(rows.map((row) => row.pincode));
const issues: Array<Record<string, unknown>> = [];
const counts = { total: rows.length, inside: 0, outside: 0, missingBoundary: 0, stateConflict: 0, postalConflict: 0, addressOutside: 0, outsideIndependentStateOutline: 0 };

for (const row of rows) {
  const postal = validatePostalDetails(directory, row.pincode, row.state as never, row.area);
  const features = boundaries.get(row.pincode) ?? [];
  const matchingState = features.filter((feature) =>
    normalizeIndianState(String(feature.properties.state ?? "")) === row.state);
  const postalStateExists = Boolean(directory.records[row.pincode]?.[row.state as keyof typeof directory.records[string]]);
  if (!postalStateExists || postal.status === "invalid") counts.postalConflict += 1;
  if (!features.length) counts.missingBoundary += 1;
  else if (!matchingState.length) counts.stateConflict += 1;
  const inside = matchingState.some((feature) => pointInPinFeature([row.longitude, row.latitude], feature));
  const outline = stateOutlines.get(row.state);
  const insideOutline = !outline || pointInPinFeature([row.longitude, row.latitude], outline);
  if (!insideOutline) counts.outsideIndependentStateOutline += 1;
  if (inside) counts.inside += 1;
  else if (matchingState.length) {
    counts.outside += 1;
    if (row.location_precision === "address") counts.addressOutside += 1;
  }
  if (inside && insideOutline && postalStateExists && postal.status !== "invalid") continue;
  const candidateFeatures = matchingState.filter((feature) => pointInsidePinFeature(feature));
  const candidate = candidateFeatures.length === 1 ? pointInsidePinFeature(candidateFeatures[0]) : null;
  issues.push({
    id: row.id, name: row.name, pincode: row.pincode, area: row.area, state: row.state,
    latitude: row.latitude, longitude: row.longitude, precision: row.location_precision,
    validationStatus: row.validation_status, postalStatus: postal.status,
    postalMessage: postal.message, boundaryCount: features.length, matchingStateBoundaries: matchingState.length,
    inside, insideIndependentStateOutline: insideOutline,
    candidate: candidate ? { latitude: candidate[1], longitude: candidate[0] } : null,
    candidateOffice: candidateFeatures.length === 1 ? candidateFeatures[0].properties.fname : null,
    automaticCorrectionEligible: Boolean(!inside && candidate && row.location_precision === "pincode" && postalStateExists && postal.status !== "invalid"),
  });
}

const report = { generatedAt: new Date().toISOString(), boundarySource: "Esri India PINCode Boundary 2025 with 2024 fallback and documented 507111 state-label correction", directorySource: directory.meta.sourceCatalog, counts, issues };
await mkdir(join(process.cwd(), "outputs"), { recursive: true });
const reportPath = join(process.cwd(), "outputs/dealer-location-audit.json");
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ reportPath, counts, issueCount: issues.length, eligible: issues.filter((issue) => issue.automaticCorrectionEligible).length, firstIssues: issues.slice(0, 30) }, null, 2));
