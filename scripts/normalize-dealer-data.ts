import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { mkdir, writeFile } from "node:fs/promises";
import { canonicalizeAreaName } from "../lib/area-normalization";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const backupDirectory =
  process.env.DEALER_IMPORT_BACKUP_DIR ??
  "/Users/nikhilanjuri/Documents/Codex/2026-09-12/https-chatgpt-com-share-6aa51e4a-8320/outputs/01a094fe-89e8-7081-9895-fd931c415125";

const prototypeOnlyDealers = [
  { id: 1, name: "SRI BALAJI KHADI", pincode: "500001" },
  { id: 2, name: "SRI SANDHYA SILKS", pincode: "509209" },
  { id: 3, name: "SV MENS WEAR", pincode: "500070" },
  { id: 5, name: "KASAM PULLIAH", pincode: "506002" },
  { id: 6, name: "SUJATHA SILKS", pincode: "508001" },
  { id: 7, name: "YUVRAJ GENTS COLLECTION", pincode: "508213" },
  { id: 10, name: "POONAM SELECTIONS", pincode: "500004" },
] as const;
const prototypeIds = prototypeOnlyDealers.map(({ id }) => id);

const sql = neon(databaseUrl);
const currentPrototypeRows = await sql.query(
  "SELECT id, name, pincode FROM dealers WHERE id = ANY($1::int[]) ORDER BY id",
  [prototypeIds],
);
const expectedPrototypeRows = prototypeOnlyDealers.map((row) => ({ ...row }));
const prototypeCleanupRequired = currentPrototypeRows.length > 0;
if (
  prototypeCleanupRequired &&
  JSON.stringify(currentPrototypeRows) !== JSON.stringify(expectedPrototypeRows)
) {
  throw new Error(
    `Prototype dealer preflight failed. Expected ${JSON.stringify(expectedPrototypeRows)}, received ${JSON.stringify(currentPrototypeRows)}.`,
  );
}

const references = prototypeCleanupRequired ? await sql.query(
  `
    SELECT dealer.id,
      (SELECT count(*)::int FROM retailer_accounts WHERE dealer_id = dealer.id) AS retailer_accounts,
      (SELECT count(*)::int FROM visits WHERE dealer_id = dealer.id) AS visits,
      (SELECT count(*)::int FROM commerce_orders WHERE dealer_id = dealer.id) AS commerce_orders,
      (SELECT count(*)::int FROM commerce_legacy_retailers WHERE matched_dealer_id = dealer.id) AS legacy_matches,
      (SELECT count(*)::int FROM dealer_import_reviews WHERE resolved_dealer_id = dealer.id) AS resolved_reviews,
      (SELECT count(*)::int FROM route_stops WHERE dealer_id = dealer.id) AS route_stops
    FROM dealers AS dealer
    WHERE dealer.id = ANY($1::int[])
    ORDER BY dealer.id
  `,
  [prototypeIds],
  ) : [];
for (const reference of references) {
  const expectedRouteStops = reference.id === 10 ? 1 : 0;
  if (
    reference.retailer_accounts !== 0 ||
    reference.visits !== 0 ||
    reference.commerce_orders !== 0 ||
    reference.legacy_matches !== 0 ||
    reference.resolved_reviews !== 0 ||
    reference.route_stops !== expectedRouteStops
  ) {
    throw new Error(`Dealer ${reference.id} has unexpected business references.`);
  }
}

const prototypeRoute = prototypeCleanupRequired ? await sql`
  SELECT plan.id, plan.route_date::text, plan.status::text,
         array_agg(stop.dealer_id ORDER BY stop.sequence) AS dealer_ids
  FROM route_plans AS plan
  JOIN route_stops AS stop ON stop.route_plan_id = plan.id
  WHERE plan.id = 1
  GROUP BY plan.id
` : [];
if (
  prototypeCleanupRequired &&
  (prototypeRoute.length !== 1 ||
    prototypeRoute[0].route_date !== "2026-09-15" ||
    prototypeRoute[0].status !== "draft" ||
    JSON.stringify(prototypeRoute[0].dealer_ids) !== JSON.stringify([8, 10, 9]))
) {
  throw new Error(`Prototype route preflight failed: ${JSON.stringify(prototypeRoute)}`);
}

const summary = {
  mode: apply ? "apply" : "dry-run",
  prototypeCleanupRequired,
  prototypeDealersToRemove: prototypeOnlyDealers,
  retainedSourceDealers: [4, 8, 9],
  prototypeRoutePlanToRemove: 1,
  references,
};

if (!apply) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

await mkdir(backupDirectory, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${backupDirectory}/database-backup-before-area-normalization-${timestamp}.json`;
const [
  salespeopleBackup,
  dealersBackup,
  rulesBackup,
  routePlansBackup,
  routeStopsBackup,
  visitsBackup,
  retailerAccountsBackup,
  ordersBackup,
  reviewBackup,
  assignmentsBackup,
] = await Promise.all([
  sql`SELECT * FROM salespeople ORDER BY id`,
  sql`SELECT * FROM dealers ORDER BY id`,
  sql`SELECT * FROM visit_rules ORDER BY id`,
  sql`SELECT * FROM route_plans ORDER BY id`,
  sql`SELECT * FROM route_stops ORDER BY id`,
  sql`SELECT * FROM visits ORDER BY id`,
  sql`SELECT * FROM retailer_accounts ORDER BY dealer_id`,
  sql`SELECT * FROM commerce_orders ORDER BY id`,
  sql`SELECT * FROM dealer_import_reviews ORDER BY id`,
  sql`SELECT * FROM territory_assignments ORDER BY id`,
]);
await writeFile(
  backupPath,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      databaseHost: new URL(databaseUrl).host,
      salespeople: salespeopleBackup,
      dealers: dealersBackup,
      visitRules: rulesBackup,
      routePlans: routePlansBackup,
      routeStops: routeStopsBackup,
      visits: visitsBackup,
      retailerAccounts: retailerAccountsBackup,
      commerceOrders: ordersBackup,
      dealerImportReviews: reviewBackup,
      territoryAssignments: assignmentsBackup,
    },
    null,
    2,
  ),
  "utf8",
);

await sql.query("ALTER TABLE dealers ADD COLUMN IF NOT EXISTS source_area text");
const dealerAreas = await sql`
  SELECT id, area, source_area
  FROM dealers
  ORDER BY id
`;
const normalizedAreas = dealerAreas.map((dealer) => {
  const sourceArea = String(dealer.source_area ?? dealer.area).trim();
  return {
    id: dealer.id,
    sourceArea,
    area: canonicalizeAreaName(sourceArea),
  };
});

const cleanupQueries = prototypeCleanupRequired
  ? [
      sql`DELETE FROM route_plans WHERE id = 1 AND route_date = '2026-09-15' AND status = 'draft'`,
      sql`DELETE FROM dealers WHERE id = ANY(${prototypeIds})`,
    ]
  : [];
await sql.transaction([
  ...cleanupQueries,
  sql.query(
    `
      WITH input AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(
          id integer,
          area text,
          "sourceArea" text
        )
      )
      UPDATE dealers AS dealer
      SET area = input.area,
          source_area = input."sourceArea",
          updated_at = now()
      FROM input
      WHERE dealer.id = input.id
    `,
    [JSON.stringify(normalizedAreas)],
  ),
]);

const [counts] = await sql`
  SELECT
    (SELECT count(*)::int FROM dealers) AS dealers,
    (SELECT count(*)::int FROM visit_rules) AS visit_rules,
    (SELECT count(*)::int FROM route_plans WHERE id = 1) AS prototype_route_plans,
    (SELECT count(*)::int FROM dealers WHERE id = ANY(${prototypeIds})) AS prototype_dealers,
    (SELECT count(*)::int FROM dealers WHERE source_area IS NULL OR btrim(source_area) = '') AS missing_source_areas
`;
if (
  counts.dealers !== 918 ||
  counts.visit_rules !== 918 ||
  counts.prototype_route_plans !== 0 ||
  counts.prototype_dealers !== 0 ||
  counts.missing_source_areas !== 0
) {
  throw new Error(`Post-cleanup verification failed: ${JSON.stringify(counts)}`);
}

console.log(JSON.stringify({ ...summary, backupPath, counts }, null, 2));
