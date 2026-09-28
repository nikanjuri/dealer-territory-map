import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pointInPinFeature, type PinFeature } from "../lib/dealer-geography.ts";
import type { PostalDirectory } from "../lib/postal-validation.ts";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");
const sql = neon(url);
const report = JSON.parse(await readFile(join(process.cwd(), "outputs/dealer-location-audit.json"), "utf8")) as {
  generatedAt: string; issues: Array<{ id: number; pincode: string; state: string; latitude: number; longitude: number; boundaryCount: number }>;
};
if (report.issues.length !== 16) throw new Error("Expected 16 unresolved locations after polygon repair.");
const directory = JSON.parse(await readFile(join(process.cwd(), "public/data/postal-directory-ap-ts.json"), "utf8")) as PostalDirectory;
const outlines = JSON.parse(await readFile(join(process.cwd(), "public/region-boundaries.geojson"), "utf8")) as {
  features: Array<PinFeature & { properties: { displayName?: string } }>;
};
const rows = await sql.query(`
  SELECT id, name, pincode, area, state::text, latitude, longitude,
         location_precision, validation_status::text, validation_source::text,
         review_note FROM dealers WHERE id = ANY($1::int[]) ORDER BY id
`, [report.issues.map((issue) => issue.id)]) as Array<{
  id: number; name: string; pincode: string; area: string; state: string;
  latitude: number; longitude: number; location_precision: string;
  validation_status: string; validation_source: string | null; review_note: string | null;
}>;
if (rows.length !== 16) throw new Error("Unresolved dealer rows changed.");

async function osmMatches(q: string) {
  const params = new URLSearchParams({ q, format: "jsonv2", addressdetails: "1", countrycodes: "in", limit: "3" });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": "dealer-territory-map/1.0 (dealer location review)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Area lookup failed (${response.status}).`);
  return await response.json() as Array<{ lat: string; lon: string; display_name: string; address?: { postcode?: string } }>;
}
const [secunderabad, chirala] = await Promise.all([
  osmMatches("500025, Hyderabad, Telangana, India"),
  osmMatches("Mgc Market Chirala Andhra Pradesh India"),
]);
const secPoint = secunderabad.find((match) => match.address?.postcode === "500025" && match.display_name.includes("Telangana"));
const chiralaPoint = chirala.find((match) => /Mahatma Gandhi Cloth Market/i.test(match.display_name) && /Chirala/i.test(match.display_name));
if (!secPoint || !chiralaPoint ||
    !directory.records["500025"]?.Telangana?.offices.includes("Rail Nilayam S.O") ||
    !directory.records["523156"]?.["Andhra Pradesh"]?.offices.some((office) => /Mgc Market/i.test(office))) {
  throw new Error("Postal and place-name corroboration failed; no changes made.");
}
const proposed = rows.map((row) => {
  const observed = report.issues.find((issue) => issue.id === row.id);
  if (!observed || observed.pincode !== row.pincode || observed.state !== row.state ||
      observed.latitude !== row.latitude || observed.longitude !== row.longitude ||
      row.location_precision !== "pincode") throw new Error(`Dealer ${row.id} changed since audit.`);
  const match = row.id === 1386 ? secPoint : row.id === 1226 ? chiralaPoint : null;
  const latitude = match ? Number(match.lat) : row.latitude;
  const longitude = match ? Number(match.lon) : row.longitude;
  const outline = outlines.features.find((feature) => feature.properties.displayName === row.state);
  if (match && outline && !pointInPinFeature([longitude, latitude], outline)) {
    throw new Error(`Suggested point for dealer ${row.id} falls outside ${row.state}.`);
  }
  const reason = row.id === 1386
    ? "Location review: PIN polygon unavailable. Point is the matching 500025 postcode location near the Rail Nilayam postal office; confirm before route use."
    : row.id === 1226
      ? "Location review: PIN polygon unavailable. Point is the Mahatma Gandhi Cloth Market in Chirala, matching the postal office name, but OpenStreetMap labels it 523155; confirm PIN 523156 before route use."
      : observed.boundaryCount === 0
        ? "Location review: PIN polygon unavailable. Confirm this approximate point before route use."
        : "Location review: postal directory and PIN polygon disagree on state. Confirm the location before route use.";
  return {
    id: row.id, pincode: row.pincode, state: row.state,
    oldLatitude: row.latitude, oldLongitude: row.longitude,
    latitude, longitude,
    expectedStatus: row.validation_status,
    expectedNote: row.review_note,
    reviewNote: [row.review_note, reason].filter(Boolean).join(" "),
  };
});
console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "apply" : "dry-run", reviewTagged: proposed.length,
  approximatePointsImproved: proposed.filter((row) => row.latitude !== row.oldLatitude || row.longitude !== row.oldLongitude).map((row) => ({ id: row.id, pincode: row.pincode, latitude: row.latitude, longitude: row.longitude })) }, null, 2));
if (!process.argv.includes("--apply")) process.exit(0);
await mkdir(join(process.cwd(), "outputs"), { recursive: true });
const backupPath = join(process.cwd(), "outputs", `unmapped-pin-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await writeFile(backupPath, JSON.stringify({ before: rows, proposed }, null, 2));
const updated = await sql.query(`
  WITH proposed AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS p(
      id integer, pincode text, state text, "oldLatitude" double precision,
      "oldLongitude" double precision, latitude double precision, longitude double precision,
      "expectedStatus" text, "expectedNote" text, "reviewNote" text
    )
  ), eligible AS (
    SELECT d.id FROM dealers d JOIN proposed p ON d.id=p.id
    WHERE d.pincode=p.pincode AND d.state::text=p.state
      AND d.latitude=p."oldLatitude" AND d.longitude=p."oldLongitude"
      AND d.validation_status::text=p."expectedStatus"
      AND d.review_note IS NOT DISTINCT FROM p."expectedNote"
  ), updated AS (
    UPDATE dealers d SET latitude=p.latitude, longitude=p.longitude,
      validation_status='review', review_note=p."reviewNote", updated_at=now()
    FROM proposed p WHERE d.id=p.id
      AND (SELECT count(*) FROM eligible)=(SELECT count(*) FROM proposed)
    RETURNING d.id
  ) SELECT id FROM updated ORDER BY id
`, [JSON.stringify(proposed)]);
if (updated.length !== proposed.length) throw new Error(`Only ${updated.length}/${proposed.length} records updated; inspect ${backupPath}.`);
console.log(JSON.stringify({ updated: updated.length, backupPath }));
