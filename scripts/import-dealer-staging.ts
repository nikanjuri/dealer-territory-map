import nextEnv from "@next/env";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import XLSX from "xlsx";
import { mkdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { INDIAN_STATES, type IndianState } from "../lib/indian-states";
import { canonicalizeAreaName } from "../lib/area-normalization";
import { pointInsidePinFeature } from "../lib/dealer-geography";
import { fetchPinBoundaries } from "../lib/pin-boundary-service";
import { normalizeIndianState } from "../lib/indian-states";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const workbookPath =
  process.env.DEALER_STAGING_WORKBOOK ??
  "/Users/nikhilanjuri/Documents/Codex/2026-09-12/https-chatgpt-com-share-6aa51e4a-8320/outputs/01a094fe-89e8-7081-9895-fd931c415125/dealer-import-staging.xlsx";
const backupDirectory =
  process.env.DEALER_IMPORT_BACKUP_DIR ??
  "/Users/nikhilanjuri/Documents/Codex/2026-09-12/https-chatgpt-com-share-6aa51e4a-8320/outputs/01a094fe-89e8-7081-9895-fd931c415125";
const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

type ReadyRow = {
  "SALES PERSON": string;
  "DEALER NAME": string;
  PINCODE: string | number;
  AREA: string;
  STATE: IndianState;
  "FULL ADDRESS": string;
  "SOURCE FILE": string;
  "SOURCE SHEET": string;
  "SOURCE ROW": number;
  "POSTAL STATUS": string;
};

type ReviewRow = {
  "SALES PERSON": string;
  "DEALER NAME": string;
  PINCODE: string | number;
  AREA: string;
  STATE: string;
  "FULL ADDRESS": string;
  "REVIEW CATEGORY": string;
  "REVIEW DETAIL": string;
  "SOURCE FILE": string;
  "SOURCE SHEET": string;
  "SOURCE ROW": number;
};

const workbook = XLSX.readFile(workbookPath);
const readySheet = workbook.Sheets["Import ready"];
const reviewSheet = workbook.Sheets.Review;
if (!readySheet || !reviewSheet) {
  throw new Error("The staging workbook must contain Import ready and Review sheets.");
}
const readyRows = XLSX.utils.sheet_to_json<ReadyRow>(readySheet, { defval: "" });
const reviewRows = XLSX.utils.sheet_to_json<ReviewRow>(reviewSheet, { defval: "" });
if (readyRows.length !== 918 || reviewRows.length !== 64) {
  throw new Error(
    `Unexpected staging counts: ready=${readyRows.length}, review=${reviewRows.length}`,
  );
}

const normalizedReady = readyRows.map((row) => ({
  salesperson: String(row["SALES PERSON"]).trim().toUpperCase(),
  dealer: String(row["DEALER NAME"]).trim().replace(/\s+/g, " ").toUpperCase(),
  pincode: String(row.PINCODE).replace(/\D/g, "").padStart(6, "0"),
  sourceArea: String(row.AREA).trim().replace(/\s+/g, " "),
  area: canonicalizeAreaName(String(row.AREA)),
  state: row.STATE,
  address: String(row["FULL ADDRESS"] ?? "").trim(),
}));
const invalidReady = normalizedReady.filter(
  (row) =>
    !row.salesperson ||
    !row.dealer ||
    !/^\d{6}$/.test(row.pincode) ||
    !row.area ||
    !INDIAN_STATES.includes(row.state),
);
if (invalidReady.length) {
  throw new Error(`${invalidReady.length} import-ready rows failed validation.`);
}

const uniquePincodes = [...new Set(normalizedReady.map((row) => row.pincode))];
const locations = await locatePincodes(normalizedReady);
const missingLocations = uniquePincodes.filter((pincode) => !locations.has(pincode));
if (missingLocations.length) {
  throw new Error(`No location could be found for PINs: ${missingLocations.join(", ")}`);
}

const sql = neon(databaseUrl);
const existing = await sql`
  SELECT
    (SELECT count(*)::int FROM dealers) AS dealers,
    (SELECT count(*)::int FROM salespeople) AS salespeople,
    (SELECT count(*)::int FROM visit_rules) AS visit_rules
`;

const summary = {
  mode: apply ? "apply" : "dry-run",
  workbook: basename(workbookPath),
  readyRows: normalizedReady.length,
  reviewRows: reviewRows.length,
  uniquePincodes: uniquePincodes.length,
  boundaryLocations: [...locations.values()].filter((value) => value.source === "postal-boundary").length,
  geocodedLocations: [...locations.values()].filter((value) => value.source === "nominatim").length,
  existing: existing[0],
};

if (!apply) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

await mkdir(backupDirectory, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${backupDirectory}/database-backup-before-dealer-import-${timestamp}.json`;
const [salespeopleBackup, dealersBackup, rulesBackup, usersBackup, assignmentsBackup] =
  await Promise.all([
    sql`SELECT * FROM salespeople ORDER BY id`,
    sql`SELECT * FROM dealers ORDER BY id`,
    sql`SELECT * FROM visit_rules ORDER BY id`,
    sql`SELECT * FROM app_users ORDER BY auth_user_id`,
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
      appUsers: usersBackup,
      territoryAssignments: assignmentsBackup,
    },
    null,
    2,
  ),
  "utf8",
);

await ensureSchema(sql);
await normalizeSalespeople(sql);

const datasetFingerprint =
  "84af12fa29adddedfa9addcf46546000d89d2e2899b2993dc88050fafc8861e2";
for (let index = 0; index < normalizedReady.length; index += 150) {
  const payload = normalizedReady.slice(index, index + 150).map((row) => {
    const location = locations.get(row.pincode)!;
    return {
      ...row,
      latitude: location.latitude,
      longitude: location.longitude,
    };
  });
  await sql.query(
    `
      WITH input AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(
          salesperson text,
          dealer text,
          pincode text,
          area text,
          "sourceArea" text,
          state text,
          address text,
          latitude double precision,
          longitude double precision
        )
      )
      INSERT INTO dealers (
        salesperson_id, name, pincode, area, source_area, address, state,
        latitude, longitude, location_precision, validation_status,
        validation_source, validation_checked_at, validation_dataset, updated_at
      )
      SELECT
        person.id,
        input.dealer,
        input.pincode,
        input.area,
        input."sourceArea",
        nullif(input.address, ''),
        input.state::state,
        input.latitude,
        input.longitude,
        'pincode'::location_precision,
        'verified'::validation_status,
        'postal-directory'::validation_source,
        now(),
        $2,
        now()
      FROM input
      JOIN salespeople AS person ON person.normalized_name = input.salesperson
      ON CONFLICT (name, pincode) DO UPDATE SET
        salesperson_id = excluded.salesperson_id,
        area = excluded.area,
        source_area = excluded.source_area,
        address = coalesce(excluded.address, dealers.address),
        state = excluded.state,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        location_precision = excluded.location_precision,
        review_note = null,
        postal_suggestions = null,
        validation_status = excluded.validation_status,
        validation_source = excluded.validation_source,
        validation_checked_at = excluded.validation_checked_at,
        validation_dataset = excluded.validation_dataset,
        updated_at = now()
    `,
    [JSON.stringify(payload), datasetFingerprint],
  );
}

await sql`
  INSERT INTO visit_rules (dealer_id, frequency_days, service_minutes, priority)
  SELECT dealer.id, 30, 30, 3
  FROM dealers AS dealer
  ON CONFLICT (dealer_id) DO NOTHING
`;

for (let index = 0; index < reviewRows.length; index += 100) {
  const payload = reviewRows.slice(index, index + 100).map((row) => ({
    salesperson: String(row["SALES PERSON"]).trim().toUpperCase(),
    dealer: String(row["DEALER NAME"]).trim().replace(/\s+/g, " "),
    pincode: String(row.PINCODE ?? "").replace(/\.0$/, "").trim(),
    area: String(row.AREA ?? "").trim(),
    state: String(row.STATE ?? "").trim(),
    address: String(row["FULL ADDRESS"] ?? "").trim(),
    reviewCategory: String(row["REVIEW CATEGORY"]).trim(),
    reviewDetail: String(row["REVIEW DETAIL"]).trim(),
    sourceFile: String(row["SOURCE FILE"]).trim(),
    sourceSheet: String(row["SOURCE SHEET"]).trim(),
    sourceRow: Number(row["SOURCE ROW"]),
  }));
  await sql.query(
    `
      WITH input AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(
          salesperson text,
          dealer text,
          pincode text,
          area text,
          state text,
          address text,
          "reviewCategory" text,
          "reviewDetail" text,
          "sourceFile" text,
          "sourceSheet" text,
          "sourceRow" integer
        )
      )
      INSERT INTO dealer_import_reviews (
        salesperson_id, name, pincode, area, state, address,
        review_category, review_detail, source_file, source_sheet, source_row
      )
      SELECT
        person.id,
        input.dealer,
        nullif(input.pincode, ''),
        nullif(input.area, ''),
        nullif(input.state, ''),
        nullif(input.address, ''),
        input."reviewCategory",
        input."reviewDetail",
        input."sourceFile",
        input."sourceSheet",
        input."sourceRow"
      FROM input
      JOIN salespeople AS person ON person.normalized_name = input.salesperson
      ON CONFLICT (source_file, source_sheet, source_row) DO UPDATE SET
        salesperson_id = excluded.salesperson_id,
        name = excluded.name,
        pincode = excluded.pincode,
        area = excluded.area,
        state = excluded.state,
        address = excluded.address,
        review_category = excluded.review_category,
        review_detail = excluded.review_detail,
        updated_at = now()
      WHERE dealer_import_reviews.status = 'pending'
    `,
    [JSON.stringify(payload)],
  );
}

const [counts] = await sql`
  SELECT
    (SELECT count(*)::int FROM dealers) AS dealers,
    (SELECT count(*)::int FROM dealer_import_reviews WHERE status = 'pending') AS pending_reviews,
    (SELECT count(*)::int FROM visit_rules) AS visit_rules,
    (SELECT count(*)::int FROM salespeople WHERE active) AS active_salespeople
`;
const states = await sql`
  SELECT state::text AS state, count(*)::int AS dealers
  FROM dealers
  GROUP BY state
  ORDER BY state
`;
console.log(JSON.stringify({ ...summary, backupPath, counts, states }, null, 2));

async function locatePincodes(rows: Array<{ pincode: string; state: IndianState }>) {
  const result = new Map<
    string,
    { latitude: number; longitude: number; source: "postal-boundary" | "nominatim" }
  >();
  const features = await fetchPinBoundaries(rows.map((row) => row.pincode));
  for (const row of rows) {
    if (result.has(row.pincode)) continue;
    const matching = (features.get(row.pincode) ?? []).filter((feature) =>
      normalizeIndianState(String(feature.properties.state ?? "")) === row.state);
    const center = matching.length === 1 ? pointInsidePinFeature(matching[0]) : null;
    if (center) {
      result.set(row.pincode, { longitude: center[0], latitude: center[1], source: "postal-boundary" });
    }
  }
  return result;
}

async function ensureSchema(sqlClient: NeonQueryFunction<false, false>) {
  for (const state of INDIAN_STATES.slice(2)) {
    const safeState = state.replaceAll("'", "''");
    await sqlClient.query(`ALTER TYPE state ADD VALUE IF NOT EXISTS '${safeState}'`);
  }
  await sqlClient.query("ALTER TABLE dealers ADD COLUMN IF NOT EXISTS source_area text");
  await sqlClient.query(`
    CREATE TABLE IF NOT EXISTS dealer_import_reviews (
      id serial PRIMARY KEY,
      salesperson_id integer NOT NULL REFERENCES salespeople(id) ON DELETE RESTRICT,
      name text NOT NULL,
      pincode text,
      area text,
      address text,
      state text,
      review_category text NOT NULL,
      review_detail text NOT NULL,
      source_file text NOT NULL,
      source_sheet text NOT NULL,
      source_row integer NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      resolved_dealer_id integer REFERENCES dealers(id) ON DELETE SET NULL,
      resolved_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await sqlClient.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS dealer_import_reviews_source_unique
    ON dealer_import_reviews (source_file, source_sheet, source_row)
  `);
  await sqlClient.query(`
    CREATE INDEX IF NOT EXISTS dealer_import_reviews_status_idx
    ON dealer_import_reviews (status)
  `);
  await sqlClient.query(`
    CREATE INDEX IF NOT EXISTS dealer_import_reviews_salesperson_idx
    ON dealer_import_reviews (salesperson_id)
  `);
}

async function normalizeSalespeople(sqlClient: NeonQueryFunction<false, false>) {
  const people = await sqlClient`
    SELECT id, normalized_name FROM salespeople
    WHERE normalized_name IN ('CHANDER', 'CHANDAR')
    ORDER BY id
  `;
  const chander = people.find((person) => person.normalized_name === "CHANDER");
  const chandar = people.find((person) => person.normalized_name === "CHANDAR");
  if (chander && chandar) {
    await sqlClient`UPDATE dealers SET salesperson_id = ${chandar.id} WHERE salesperson_id = ${chander.id}`;
    await sqlClient`UPDATE territory_assignments SET salesperson_id = ${chandar.id} WHERE salesperson_id = ${chander.id}`;
    await sqlClient`UPDATE route_plans SET salesperson_id = ${chandar.id} WHERE salesperson_id = ${chander.id}`;
    await sqlClient`UPDATE app_users SET salesperson_id = ${chandar.id} WHERE salesperson_id = ${chander.id}`;
    await sqlClient`UPDATE salespeople SET active = false, updated_at = now() WHERE id = ${chander.id}`;
  } else if (chander) {
    await sqlClient`
      UPDATE salespeople
      SET normalized_name = 'CHANDAR', display_name = 'Chandar', updated_at = now()
      WHERE id = ${chander.id}
    `;
  }
  const defaults = [
    { normalizedName: "KIRAN", displayName: "Kiran", color: "#df4e3f" },
    { normalizedName: "MADHU", displayName: "Madhu", color: "#2f6fe4" },
    { normalizedName: "CHANDAR", displayName: "Chandar", color: "#c48a12" },
  ];
  for (const person of defaults) {
    await sqlClient`
      INSERT INTO salespeople (normalized_name, display_name, color, active)
      VALUES (${person.normalizedName}, ${person.displayName}, ${person.color}, true)
      ON CONFLICT (normalized_name) DO UPDATE SET
        display_name = excluded.display_name,
        color = excluded.color,
        active = true,
        updated_at = now()
    `;
  }
}
