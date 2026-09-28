import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

type PreviewRow = {
  decision: "high-confidence" | "review" | "no-change" | "no-proposal";
  affectedDealers: number;
  state: string;
  pincode: string;
  currentArea: string;
  proposedArea: string;
  postalOffice: string;
  postalDistrict: string;
  reason: string;
  dealerIds: number[];
};

type Preview = {
  generatedAt: string;
  readOnly: boolean;
  postalSha256: string;
  dealerCount: number;
  rows: PreviewRow[];
};

const apply = process.argv.includes("--apply");
const previewArg = process.argv.find((value) => value.startsWith("--preview="));
const previewPath = path.resolve(
  previewArg?.slice("--preview=".length) ??
    "outputs/area-normalization-preview-2026-09-17/preview.json",
);
const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const backupDirectory =
  process.env.DEALER_IMPORT_BACKUP_DIR ??
  "/Users/nikhilanjuri/Documents/Codex/2026-09-12/https-chatgpt-com-share-6aa51e4a-8320/outputs/01a094fe-89e8-7081-9895-fd931c415125";

const preview = JSON.parse(await readFile(previewPath, "utf8")) as Preview;
if (!preview.readOnly || preview.dealerCount !== 918) {
  throw new Error("Unexpected preview metadata; refusing to continue.");
}

const highConfidenceRows = preview.rows.filter(
  (row) => row.decision === "high-confidence",
);
const reviewRows = preview.rows.filter((row) => row.decision === "review");
const highConfidenceIds = highConfidenceRows.flatMap((row) => row.dealerIds);
const reviewIds = reviewRows.flatMap((row) => row.dealerIds);
const affectedIds = [...new Set([...highConfidenceIds, ...reviewIds])];
if (
  highConfidenceRows.length !== 32 ||
  highConfidenceIds.length !== 55 ||
  reviewRows.length !== 38 ||
  reviewIds.length !== 74 ||
  affectedIds.length !== 129
) {
  throw new Error(
    `Preview counts changed unexpectedly: ${JSON.stringify({
      highConfidenceGroups: highConfidenceRows.length,
      highConfidenceDealers: highConfidenceIds.length,
      reviewGroups: reviewRows.length,
      reviewDealers: reviewIds.length,
      affectedDealers: affectedIds.length,
    })}`,
  );
}

const sql = neon(databaseUrl);
const currentDealers = await sql.query(
  `SELECT * FROM dealers WHERE id = ANY($1::int[]) ORDER BY id`,
  [affectedIds],
);
if (currentDealers.length !== affectedIds.length) {
  throw new Error(
    `Expected ${affectedIds.length} affected dealers, found ${currentDealers.length}.`,
  );
}
const dealerById = new Map(currentDealers.map((dealer) => [dealer.id, dealer]));

for (const row of [...highConfidenceRows, ...reviewRows]) {
  if (row.dealerIds.length !== row.affectedDealers) {
    throw new Error(`Dealer ID count does not match preview group ${row.pincode}.`);
  }
  for (const id of row.dealerIds) {
    const dealer = dealerById.get(id);
    if (!dealer) throw new Error(`Dealer ${id} is missing.`);
    if (dealer.pincode !== row.pincode || dealer.state !== row.state) {
      throw new Error(`Dealer ${id} no longer matches its preview PIN/state.`);
    }
    const acceptableAreas =
      row.decision === "high-confidence"
        ? [row.currentArea, row.proposedArea]
        : [row.currentArea];
    if (!acceptableAreas.includes(dealer.area)) {
      throw new Error(
        `Dealer ${id} area changed after preview: ${dealer.area}.`,
      );
    }
  }
}

const summary = {
  mode: apply ? "apply" : "dry-run",
  previewPath,
  postalSha256: preview.postalSha256,
  highConfidenceGroups: highConfidenceRows.length,
  highConfidenceDealers: highConfidenceIds.length,
  reviewGroups: reviewRows.length,
  reviewDealers: reviewIds.length,
  databaseDealersBefore: await sql`SELECT count(*)::int AS count FROM dealers`,
};

if (!apply) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

await mkdir(backupDirectory, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${backupDirectory}/database-backup-before-postal-area-implementation-${timestamp}.json`;
await writeFile(
  backupPath,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      databaseHost: new URL(databaseUrl).host,
      preview: {
        path: path.basename(previewPath),
        generatedAt: preview.generatedAt,
        postalSha256: preview.postalSha256,
      },
      dealers: currentDealers,
    },
    null,
    2,
  ),
  "utf8",
);

const highConfidencePayload = highConfidenceRows.flatMap((row) =>
  row.dealerIds.map((id) => ({
    id,
    currentArea: row.currentArea,
    proposedArea: row.proposedArea,
  })),
);
const reviewPayload = reviewRows.flatMap((row) =>
  row.dealerIds.map((id) => ({
    id,
    currentArea: row.currentArea,
    proposedArea: row.proposedArea,
    reviewNote: `Postal review suggests “${row.proposedArea}” for PIN ${row.pincode}. Confirm the business locality before changing it.`,
  })),
);

await sql.transaction([
  sql.query(
    `
      WITH input AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(
          id integer,
          "currentArea" text,
          "proposedArea" text
        )
      )
      UPDATE dealers AS dealer
      SET area = input."proposedArea",
          postal_suggestions = NULL,
          validation_status = 'verified'::validation_status,
          validation_source = 'postal-directory'::validation_source,
          validation_checked_at = now(),
          validation_dataset = $2,
          updated_at = now()
      FROM input
      WHERE dealer.id = input.id
        AND dealer.area IN (input."currentArea", input."proposedArea")
    `,
    [JSON.stringify(highConfidencePayload), preview.postalSha256],
  ),
  sql.query(
    `
      WITH input AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(
          id integer,
          "currentArea" text,
          "proposedArea" text,
          "reviewNote" text
        )
      )
      UPDATE dealers AS dealer
      SET postal_suggestions = jsonb_build_array(input."proposedArea"),
          validation_status = 'review'::validation_status,
          validation_source = 'postal-directory'::validation_source,
          validation_checked_at = now(),
          validation_dataset = $2,
          review_note = coalesce(dealer.review_note, input."reviewNote"),
          updated_at = now()
      FROM input
      WHERE dealer.id = input.id
        AND dealer.area = input."currentArea"
    `,
    [JSON.stringify(reviewPayload), preview.postalSha256],
  ),
]);

const [verification] = await sql.query(
  `
    SELECT
      (SELECT count(*)::int FROM dealers) AS dealers,
      (SELECT count(*)::int FROM dealers WHERE id = ANY($1::int[]) AND validation_status = 'verified') AS high_confidence_verified,
      (SELECT count(*)::int FROM dealers WHERE id = ANY($2::int[]) AND validation_status = 'review') AS review_flagged,
      (SELECT count(*)::int FROM dealers WHERE source_area IS NULL OR btrim(source_area) = '') AS missing_source_area
  `,
  [highConfidenceIds, reviewIds],
);
if (
  verification.dealers !== 918 ||
  verification.high_confidence_verified !== 55 ||
  verification.review_flagged !== 74 ||
  verification.missing_source_area !== 0
) {
  throw new Error(`Post-apply verification failed: ${JSON.stringify(verification)}`);
}

for (const row of highConfidenceRows) {
  const [count] = await sql.query(
    `SELECT count(*)::int AS count FROM dealers WHERE id = ANY($1::int[]) AND area = $2`,
    [row.dealerIds, row.proposedArea],
  );
  if (count.count !== row.dealerIds.length) {
    throw new Error(`Area update verification failed for ${row.pincode}.`);
  }
}

console.log(JSON.stringify({ ...summary, backupPath, verification }, null, 2));
