import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  findAutoVerifiablePostalMatch,
  type PostalDirectory,
  type PostalState,
} from "../lib/postal-validation.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const backupDirectory =
  process.env.DEALER_IMPORT_BACKUP_DIR ??
  "/Users/nikhilanjuri/Documents/Codex/2026-09-12/https-chatgpt-com-share-6aa51e4a-8320/outputs/01a094fe-89e8-7081-9895-fd931c415125";
const directory = JSON.parse(
  await readFile("public/data/postal-directory-ap-ts.json", "utf8"),
) as PostalDirectory;
const sql = neon(databaseUrl);
const dealers = await sql`
  SELECT id, name, pincode, area, source_area, state::text AS state,
         review_note, postal_suggestions
  FROM dealers
  WHERE validation_status = 'review'
  ORDER BY id
`;

const candidates = dealers.flatMap((dealer) => {
  const entry = directory.records[String(dealer.pincode)]?.[
    String(dealer.state) as PostalState
  ];
  if (!entry) return [];
  const match = findAutoVerifiablePostalMatch(
    entry,
    String(dealer.source_area ?? dealer.area),
  );
  return match
    ? [{
        id: Number(dealer.id),
        name: String(dealer.name),
        pincode: String(dealer.pincode),
        area: String(dealer.area),
        sourceArea: String(dealer.source_area ?? ""),
        state: String(dealer.state),
        previousReviewNote: String(dealer.review_note ?? ""),
        previousPostalSuggestions: dealer.postal_suggestions,
        matchedName: match.matchedName,
        reason: match.reason,
        score: match.score,
      }]
    : [];
});

const summary = {
  mode: apply ? "apply" : "dry-run",
  mappedReviewsBefore: dealers.length,
  autoVerified: candidates.length,
  remainingMappedReviews: dealers.length - candidates.length,
  reasons: countBy(candidates, (candidate) => candidate.reason),
  examples: candidates.slice(0, 30).map((candidate) => ({
    id: candidate.id,
    dealer: candidate.name,
    area: candidate.area,
    pincode: candidate.pincode,
    state: candidate.state,
    matchedName: candidate.matchedName,
    reason: candidate.reason,
  })),
  postalDataset: directory.meta.sourceSha256,
};

if (!apply) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

await mkdir(backupDirectory, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = join(
  backupDirectory,
  `dealer-area-reviews-before-auto-verification-${timestamp}.json`,
);
await writeFile(
  backupPath,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      postalDataset: directory.meta.sourceSha256,
      candidates,
    },
    null,
    2,
  ),
  "utf8",
);

if (candidates.length) {
  await sql.query(
    `
      WITH input AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(id integer)
      )
      UPDATE dealers AS dealer
      SET validation_status = 'verified'::validation_status,
          validation_source = 'postal-directory'::validation_source,
          validation_checked_at = now(),
          validation_dataset = $2,
          review_note = NULL,
          postal_suggestions = '[]'::jsonb,
          updated_at = now()
      FROM input
      WHERE dealer.id = input.id
        AND dealer.validation_status = 'review'
    `,
    [JSON.stringify(candidates.map(({ id }) => ({ id }))), directory.meta.sourceSha256],
  );
}

const [after] = await sql`
  SELECT
    count(*) FILTER (WHERE validation_status = 'review')::int AS mapped_reviews,
    count(*) FILTER (WHERE validation_status = 'verified')::int AS verified_dealers
  FROM dealers
`;
console.log(JSON.stringify({ ...summary, backupPath, after }, null, 2));

function countBy<T>(rows: T[], keyFor: (row: T) => string) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = keyFor(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}
