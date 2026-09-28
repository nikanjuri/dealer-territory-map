import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizePostalName, type PostalDirectory } from "../lib/postal-validation.ts";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");
const backupName = process.argv.find((value) => value.startsWith("dealer-location-backup-"));
if (!backupName || backupName.includes("/") || !backupName.endsWith(".json")) {
  throw new Error("Pass the exact dealer-location-backup-*.json filename.");
}
const backup = JSON.parse(await readFile(join(process.cwd(), "outputs", backupName), "utf8")) as {
  before: Array<{ id: number; area: string; pincode: string; state: string; validation_status: string; review_note: string | null }>;
  proposed: Array<{ id: number; pincode: string; state: string; latitude: number; longitude: number; alternativePins: string[]; reviewNote: string | null; validationStatus: string }>;
};
const directory = JSON.parse(await readFile(join(process.cwd(), "public/data/postal-directory-ap-ts.json"), "utf8")) as PostalDirectory;
const prior = new Map(backup.before.map((row) => [row.id, row]));
const corrections = backup.proposed.filter((fix) => {
  if (!fix.alternativePins.length) return false;
  const row = prior.get(fix.id);
  return Boolean(row && directory.records[row.pincode]?.[row.state as keyof PostalDirectory["records"][string]]?.offices
    .some((office) => normalizePostalName(office) === normalizePostalName(row.area)));
}).map((fix) => ({
  id: fix.id, pincode: fix.pincode, state: fix.state, latitude: fix.latitude,
  longitude: fix.longitude, expectedNote: fix.reviewNote,
  reviewNote: prior.get(fix.id)?.review_note ?? null,
  validationStatus: prior.get(fix.id)?.validation_status ?? "review",
}));
console.log(JSON.stringify({ falseReviewTags: corrections.length, ids: corrections.map((fix) => fix.id), mode: process.argv.includes("--apply") ? "apply" : "dry-run" }));
if (!process.argv.includes("--apply")) process.exit(0);
if (corrections.length !== 36) throw new Error(`Expected 36 false review tags, found ${corrections.length}.`);
const sql = neon(url);
const updated = await sql.query(`
  WITH proposed AS (
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS p(
      id integer, pincode text, state text, latitude double precision,
      longitude double precision, "expectedNote" text, "reviewNote" text,
      "validationStatus" text
    )
  ), eligible AS (
    SELECT d.id FROM dealers d JOIN proposed p ON d.id=p.id
    WHERE d.pincode=p.pincode AND d.state::text=p.state
      AND d.latitude=p.latitude AND d.longitude=p.longitude
      AND d.review_note IS NOT DISTINCT FROM p."expectedNote"
      AND d.validation_status::text='review'
  ), updated AS (
    UPDATE dealers d SET review_note=p."reviewNote",
      validation_status=p."validationStatus"::validation_status,
      updated_at=now()
    FROM proposed p WHERE d.id=p.id
      AND (SELECT count(*) FROM eligible)=(SELECT count(*) FROM proposed)
    RETURNING d.id
  ) SELECT id FROM updated ORDER BY id
`, [JSON.stringify(corrections)]);
if (updated.length !== corrections.length) throw new Error(`Restored ${updated.length}/${corrections.length}; inspect current records.`);
console.log(JSON.stringify({ restored: updated.length }));
