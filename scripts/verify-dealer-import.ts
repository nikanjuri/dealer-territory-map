import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import XLSX from "xlsx";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const workbookPath =
  process.env.DEALER_STAGING_WORKBOOK ??
  "/Users/nikhilanjuri/Documents/Codex/2026-09-12/https-chatgpt-com-share-6aa51e4a-8320/outputs/01a094fe-89e8-7081-9895-fd931c415125/dealer-import-staging.xlsx";

const workbook = XLSX.readFile(workbookPath);
const ready = XLSX.utils.sheet_to_json<Record<string, unknown>>(
  workbook.Sheets["Import ready"],
  { defval: "" },
);
const sourceIdentities = new Set(
  ready.map(
    (row) =>
      `${String(row["DEALER NAME"]).trim().replace(/\s+/g, " ").toUpperCase()}|${String(row.PINCODE).replace(/\D/g, "").padStart(6, "0")}`,
  ),
);

const sql = neon(databaseUrl);
const dealers = await sql`
  SELECT dealer.id, dealer.name, dealer.pincode, dealer.area, dealer.state::text,
         person.normalized_name AS salesperson
  FROM dealers AS dealer
  JOIN salespeople AS person ON person.id = dealer.salesperson_id
  ORDER BY dealer.id
`;
const extras = dealers.filter(
  (dealer) => !sourceIdentities.has(`${dealer.name}|${dealer.pincode}`),
);
const extraIds = extras.map((dealer) => dealer.id);
const references = extraIds.length
  ? await sql.query(
      `
        SELECT dealer.id,
          (SELECT count(*)::int FROM retailer_accounts WHERE dealer_id = dealer.id) AS retailer_accounts,
          (SELECT count(*)::int FROM route_stops WHERE dealer_id = dealer.id) AS route_stops,
          (SELECT count(*)::int FROM visits WHERE dealer_id = dealer.id) AS visits,
          (SELECT count(*)::int FROM commerce_orders WHERE dealer_id = dealer.id) AS commerce_orders
        FROM dealers AS dealer
        WHERE dealer.id = ANY($1::int[])
        ORDER BY dealer.id
      `,
      [extraIds],
    )
  : [];
const [integrity] = await sql`
  SELECT
    (SELECT count(*)::int FROM dealers) AS dealers,
    (SELECT count(*)::int FROM dealer_import_reviews WHERE status = 'pending') AS pending_reviews,
    (SELECT count(*)::int FROM dealers AS dealer LEFT JOIN visit_rules AS rule ON rule.dealer_id = dealer.id WHERE rule.id IS NULL) AS dealers_without_visit_rules,
    (SELECT count(*)::int FROM dealers WHERE source_area IS NULL OR btrim(source_area) = '') AS dealers_without_source_area,
    (SELECT count(*)::int FROM (SELECT name, pincode FROM dealers GROUP BY name, pincode HAVING count(*) > 1) duplicate) AS duplicate_identities,
    (SELECT count(*)::int FROM salespeople WHERE normalized_name = 'CHANDER') AS chander_rows,
    (SELECT count(*)::int FROM salespeople WHERE normalized_name = 'CHANDAR' AND active) AS active_chandar_rows
`;
const reviewCategories = await sql`
  SELECT review_category, count(*)::int AS rows
  FROM dealer_import_reviews
  WHERE status = 'pending'
  GROUP BY review_category
  ORDER BY review_category
`;
const salespersonCounts = await sql`
  SELECT person.normalized_name AS salesperson, count(dealer.id)::int AS dealers
  FROM salespeople AS person
  LEFT JOIN dealers AS dealer ON dealer.salesperson_id = person.id
  WHERE person.active
  GROUP BY person.id, person.normalized_name
  ORDER BY person.normalized_name
`;
const missingSourceRows = ready.filter((row) => {
  const identity = `${String(row["DEALER NAME"]).trim().replace(/\s+/g, " ").toUpperCase()}|${String(row.PINCODE).replace(/\D/g, "").padStart(6, "0")}`;
  return !dealers.some((dealer) => `${dealer.name}|${dealer.pincode}` === identity);
});

console.log(
  JSON.stringify(
    {
      integrity,
      sourceReadyRows: ready.length,
      missingSourceRows: missingSourceRows.length,
      reviewCategories,
      salespersonCounts,
      extraDealers: extras,
      extraDealerReferences: references,
    },
    null,
    2,
  ),
);
