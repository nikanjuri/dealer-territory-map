import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pointInPinFeature, pointInsidePinFeature, type PinFeature } from "../lib/dealer-geography.ts";
import { fetchPinBoundaries } from "../lib/pin-boundary-service.ts";
import { normalizeIndianState } from "../lib/indian-states.ts";
import type { PostalDirectory } from "../lib/postal-validation.ts";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");
const sql = neon(url);
const backup = JSON.parse(await readFile(join(process.cwd(),
  "outputs/unmapped-pin-backup-2026-09-25T19-24-41-887Z.json"), "utf8")) as {
  before: Array<{ id: number; pincode: string; state: string; latitude: number; longitude: number;
    validation_status: string; review_note: string | null }>;
  proposed: Array<{ id: number; latitude: number; longitude: number; reviewNote: string }>;
};
const directory = JSON.parse(await readFile(join(process.cwd(),
  "public/data/postal-directory-ap-ts.json"), "utf8")) as PostalDirectory;
const regions = JSON.parse(await readFile(join(process.cwd(),
  "public/region-boundaries.geojson"), "utf8")) as {
  features: Array<PinFeature & { properties: { displayName?: string } }>;
};
const ids = backup.before.map((row) => row.id);
if (ids.length !== 16 || new Set(ids).size !== 16) throw new Error("Expected 16 unique rows in the first review backup.");
const current = await sql.query(`
  SELECT id, pincode, area, state::text, latitude, longitude,
    location_precision::text, validation_status::text, review_note
  FROM dealers WHERE id = ANY($1::int[]) ORDER BY id
`, [ids]) as Array<{ id: number; pincode: string; area: string; state: string;
  latitude: number; longitude: number; location_precision: string;
  validation_status: string; review_note: string | null }>;
if (current.length !== 16) throw new Error("Dealer count changed since first review.");
const boundaries = await fetchPinBoundaries(backup.before.map((row) => row.pincode));
const planned = current.map((row) => {
  const original = backup.before.find((item) => item.id === row.id)!;
  const earlier = backup.proposed.find((item) => item.id === row.id)!;
  if (row.pincode !== original.pincode || row.state !== original.state ||
      row.latitude !== earlier.latitude || row.longitude !== earlier.longitude ||
      row.validation_status !== "review" || row.review_note !== earlier.reviewNote ||
      row.location_precision !== "pincode" || !directory.records[row.pincode]?.[row.state as keyof PostalDirectory["records"][string]]) {
    throw new Error(`Dealer ${row.id} changed since first review.`);
  }
  const matching = (boundaries.get(row.pincode) ?? []).filter((feature) =>
    normalizeIndianState(String(feature.properties.state ?? "")) === row.state);
  if (matching.length !== 1) throw new Error(`PIN ${row.pincode} lacks one state-matching polygon.`);
  const currentPoint: [number, number] = [row.longitude, row.latitude];
  const inside = pointInPinFeature(currentPoint, matching[0]);
  const candidate = inside ? currentPoint : pointInsidePinFeature(matching[0]);
  if (!candidate || !pointInPinFeature(candidate, matching[0])) throw new Error(`No safe interior point for ${row.pincode}.`);
  const region = regions.features.find((feature) => feature.properties.displayName === row.state);
  if (!region || !pointInPinFeature(candidate, region)) throw new Error(`PIN ${row.pincode} point falls outside ${row.state}.`);
  return { id: row.id, pincode: row.pincode, state: row.state,
    oldLatitude: row.latitude, oldLongitude: row.longitude,
    latitude: candidate[1], longitude: candidate[0],
    oldNote: row.review_note, originalNote: original.review_note,
    originalStatus: original.validation_status, moved: !inside };
});
const summary = { mode: process.argv.includes("--apply") ? "apply" : "dry-run",
  checked: planned.length, corrected: planned.filter((row) => row.moved).length,
  statusRestoredToVerified: planned.filter((row) => row.originalStatus === "verified").length,
  remainsAreaReview: planned.filter((row) => row.originalStatus === "review").length,
  corrections: planned.filter((row) => row.moved).map((row) => ({ id: row.id, pincode: row.pincode,
    latitude: row.latitude, longitude: row.longitude })) };
console.log(JSON.stringify(summary, null, 2));
if (!process.argv.includes("--apply")) process.exit(0);
if (summary.corrected !== 8 || summary.statusRestoredToVerified !== 8 || summary.remainsAreaReview !== 8) {
  throw new Error("Unexpected resolution distribution; inspect the dry run.");
}
await mkdir(join(process.cwd(), "outputs"), { recursive: true });
const backupPath = join(process.cwd(), "outputs", `alternate-pin-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await writeFile(backupPath, JSON.stringify({ before: current, planned,
  boundarySources: ["Esri India PINCode Boundary 2025", "Esri India Postal Code Boundaries 2024"] }, null, 2));
const updated = await sql.query(`
  WITH proposed AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS p(
      id integer, pincode text, state text, "oldLatitude" double precision,
      "oldLongitude" double precision, latitude double precision,
      longitude double precision, "oldNote" text, "originalNote" text,
      "originalStatus" text, moved boolean
    )
  ), eligible AS (
    SELECT d.id FROM dealers d JOIN proposed p ON d.id=p.id
    WHERE d.pincode=p.pincode AND d.state::text=p.state
      AND d.latitude=p."oldLatitude" AND d.longitude=p."oldLongitude"
      AND d.validation_status='review' AND d.review_note IS NOT DISTINCT FROM p."oldNote"
  ), update_rows AS (
    UPDATE dealers d SET latitude=p.latitude, longitude=p.longitude,
      validation_status=p."originalStatus"::validation_status,
      review_note=p."originalNote", updated_at=now()
    FROM proposed p WHERE d.id=p.id
      AND (SELECT count(*) FROM eligible)=(SELECT count(*) FROM proposed)
    RETURNING d.id
  ) SELECT id FROM update_rows ORDER BY id
`, [JSON.stringify(planned)]);
if (updated.length !== planned.length) throw new Error(`Only ${updated.length}/${planned.length} rows updated; inspect ${backupPath}.`);
console.log(JSON.stringify({ updated: updated.length, backupPath }));
