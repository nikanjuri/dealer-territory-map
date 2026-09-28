import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fetchPinBoundaries } from "../lib/pin-boundary-service.ts";
import { pointInPinFeature, pointInsidePinFeature, type PinFeature } from "../lib/dealer-geography.ts";
import { normalizeIndianState } from "../lib/indian-states.ts";
import { normalizePostalName, type PostalDirectory } from "../lib/postal-validation.ts";

nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");
const sql = neon(url);
const audit = JSON.parse(await readFile(join(process.cwd(), "outputs/dealer-location-audit.json"), "utf8")) as {
  generatedAt: string;
  counts: { total: number };
  issues: Array<{ id: number; pincode: string; state: string; latitude: number; longitude: number; area: string; automaticCorrectionEligible: boolean }>;
};
if (Date.now() - new Date(audit.generatedAt).getTime() > 24 * 60 * 60 * 1000) {
  throw new Error("Location audit is older than 24 hours. Run the audit again.");
}
const directory = JSON.parse(await readFile(join(process.cwd(), "public/data/postal-directory-ap-ts.json"), "utf8")) as PostalDirectory;
const regionData = JSON.parse(await readFile(join(process.cwd(), "public/region-boundaries.geojson"), "utf8")) as {
  features: Array<PinFeature & { properties: { displayName?: string } }>;
};
const current = await sql.query(`
  SELECT id, name, pincode, area, state::text, latitude, longitude,
         location_precision, validation_status::text, validation_source::text,
         review_note, geocoded_address, address
  FROM dealers ORDER BY id
`) as Array<{
  id: number; name: string; pincode: string; area: string; state: string;
  latitude: number; longitude: number; location_precision: string;
  validation_status: string; validation_source: string | null;
  review_note: string | null; geocoded_address: string | null; address: string | null;
}>;
if (current.length !== audit.counts.total) throw new Error("Dealer count changed since the audit.");
const byId = new Map(current.map((row) => [row.id, row]));
const boundaries = await fetchPinBoundaries(audit.issues.map((issue) => issue.pincode));
const officePins = new Map<string, Set<string>>();
for (const [pin, states] of Object.entries(directory.records)) {
  for (const [state, entry] of Object.entries(states)) {
    for (const office of entry.offices) {
      const key = `${state}|${normalizePostalName(office)}`;
      const pins = officePins.get(key) ?? new Set<string>();
      pins.add(pin);
      officePins.set(key, pins);
    }
  }
}
const fixes: Array<Record<string, unknown>> = [];
const reviews: Array<Record<string, unknown>> = [];
for (const issue of audit.issues) {
  const row = byId.get(issue.id);
  if (!row || row.pincode !== issue.pincode || row.state !== issue.state ||
      row.latitude !== issue.latitude || row.longitude !== issue.longitude) {
    throw new Error(`Dealer ${issue.id} changed since the audit; run it again.`);
  }
  if (!issue.automaticCorrectionEligible) {
    reviews.push({ id: row.id, reason: "PIN boundary missing or state disagrees with postal directory" });
    continue;
  }
  if (row.location_precision !== "pincode" || !directory.records[row.pincode]?.[row.state as keyof PostalDirectory["records"][string]]) {
    throw new Error(`Dealer ${row.id} no longer qualifies for a PIN-based correction.`);
  }
  const matching = (boundaries.get(row.pincode) ?? []).filter((feature) =>
    normalizeIndianState(String(feature.properties.state ?? "")) === row.state);
  if (matching.length !== 1) throw new Error(`PIN ${row.pincode} no longer has one matching state boundary.`);
  const point = pointInsidePinFeature(matching[0]);
  if (!point || !pointInPinFeature(point, matching[0])) throw new Error(`PIN ${row.pincode} has no interior point.`);
  const stateOutline = regionData.features.find((feature) => feature.properties.displayName === row.state);
  if (stateOutline && !pointInPinFeature(point, stateOutline)) {
    throw new Error(`PIN ${row.pincode} disagrees with the independent ${row.state} outline.`);
  }
  const matchingOfficePins = officePins.get(`${row.state}|${normalizePostalName(row.area)}`) ?? new Set<string>();
  const alternatives = matchingOfficePins.has(row.pincode) ? []
    : [...matchingOfficePins].filter((pin) => pin !== row.pincode);
  const locationReview = alternatives.length > 0
    ? `Location review: ${row.area} also appears as a postal office under ${alternatives.slice(0, 5).join(", ")}; confirm the dealer's PIN before route use.`
    : null;
  fixes.push({
    id: row.id, pincode: row.pincode, state: row.state,
    oldLatitude: row.latitude, oldLongitude: row.longitude,
    latitude: point[1], longitude: point[0],
    reviewNote: locationReview ? [row.review_note, locationReview].filter(Boolean).join(" ") : row.review_note,
    validationStatus: locationReview ? "review" : row.validation_status,
    alternativePins: alternatives,
  });
}
const preview = {
  mode: apply ? "apply" : "dry-run",
  auditedDealers: current.length,
  corrected: fixes.length,
  correctionsWithAlternativePostalPIN: fixes.filter((fix) => (fix.alternativePins as string[]).length).length,
  unresolved: reviews.length,
  severeCorrections: fixes.filter((fix) => Math.abs(Number(fix.oldLongitude) - Number(fix.longitude)) > 1 ||
    Math.abs(Number(fix.oldLatitude) - Number(fix.latitude)) > 1).map((fix) => ({ id: fix.id, pincode: fix.pincode })),
};
if (!apply) { console.log(JSON.stringify(preview, null, 2)); process.exit(0); }
if (fixes.length !== 472 || reviews.length !== 16) {
  throw new Error(`Unexpected correction size ${fixes.length}/${reviews.length}; review before applying.`);
}
await mkdir(join(process.cwd(), "outputs"), { recursive: true });
const backupPath = join(process.cwd(), "outputs", `dealer-location-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await writeFile(backupPath, JSON.stringify({ audit: audit.generatedAt, boundarySource: "Esri India PINCode Boundary 2025", before: current.filter((row) => fixes.some((fix) => fix.id === row.id)), proposed: fixes }, null, 2));
const updated = await sql.query(`
  WITH proposed AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS p(
      id integer, pincode text, state text, "oldLatitude" double precision,
      "oldLongitude" double precision, latitude double precision,
      longitude double precision, "reviewNote" text, "validationStatus" text
    )
  ), eligible AS (
    SELECT d.id FROM dealers d JOIN proposed p ON d.id=p.id
    WHERE d.pincode=p.pincode AND d.state::text=p.state
      AND d.latitude=p."oldLatitude" AND d.longitude=p."oldLongitude"
      AND d.location_precision='pincode'
  ), update_rows AS (
    UPDATE dealers d SET latitude=p.latitude, longitude=p.longitude,
      review_note=p."reviewNote", validation_status=p."validationStatus"::validation_status,
      updated_at=now()
    FROM proposed p WHERE d.id=p.id
      AND (SELECT count(*) FROM eligible)=(SELECT count(*) FROM proposed)
    RETURNING d.id
  ) SELECT id FROM update_rows ORDER BY id
`, [JSON.stringify(fixes)]);
if (updated.length !== fixes.length) throw new Error(`Only ${updated.length}/${fixes.length} corrections applied. Check backup ${backupPath}.`);
console.log(JSON.stringify({ ...preview, applied: updated.length, backupPath }, null, 2));
