import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import XLSX from "xlsx";

import { canonicalizeAreaName } from "../lib/area-normalization.ts";
import { pointInsidePinFeature } from "../lib/dealer-geography.ts";
import { fetchPinBoundaries } from "../lib/pin-boundary-service.ts";
import {
  isSalespersonMarkerRow,
  normalizeSourceArea,
  normalizeSourceDealerName,
  normalizeSourcePincode,
  salespersonFromSourceFilename,
  sourceDealerIdentity,
} from "../lib/dealer-source-import.ts";
import {
  normalizeIndianState,
  type IndianState,
} from "../lib/indian-states.ts";
import {
  validatePostalDetails,
  type PostalDirectory,
  type PostalDirectoryEntry,
} from "../lib/postal-validation.ts";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const rawDirectory = process.env.DEALER_SOURCE_DIR ?? join(process.cwd(), "raw-data");
const previousStagingPath =
  process.env.DEALER_PREVIOUS_STAGING_WORKBOOK ??
  join(rawDirectory, "dealer-import-staging.xlsx");
const backupDirectory =
  process.env.DEALER_IMPORT_BACKUP_DIR ??
  "/Users/nikhilanjuri/Documents/Codex/2026-09-12/https-chatgpt-com-share-6aa51e4a-8320/outputs/01a094fe-89e8-7081-9895-fd931c415125";
const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const postalMirror =
  "https://raw.githubusercontent.com/dropdevrahul/pincodes-india/main/pincode.csv";
const postalCatalog =
  "https://www.data.gov.in/resource/all-india-pincode-directory-till-last-month";

const SALESPERSON_COLORS: Record<string, string> = {
  CHANDAR: "#c48a12",
  KIRAN: "#df4e3f",
  MADHU: "#2f6fe4",
  GHANSHYAM: "#7c3aed",
  JIGNESH: "#5967b8",
  "OM SHANKAR": "#be185d",
  RANGAIAH: "#0f766e",
  RAVI: "#4f46e5",
  SONU: "#15803d",
  SUBHASH: "#92400e",
  VENKATESH: "#0e7490",
  "VIJAY KUMAR": "#c2410c",
};

type PostalSourceRow = Record<string, unknown> & {
  StateName?: unknown;
  Pincode?: unknown;
  District?: unknown;
  OfficeName?: unknown;
  Block?: unknown;
  Taluk?: unknown;
  Latitude?: unknown;
  Longitude?: unknown;
};

type ParsedSourceRow = {
  salesperson: string;
  dealer: string;
  pincode: string;
  area: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
};

type ImportReadyRow = ParsedSourceRow & {
  state: IndianState;
  canonicalArea: string;
  latitude: number;
  longitude: number;
  validationStatus: "verified" | "review";
  reviewNote: string | null;
  postalSuggestions: string[];
};

type ReviewRow = ParsedSourceRow & {
  state: string;
  reviewCategory: string;
  reviewDetail: string;
};

const sourceFiles = (await readdir(rawDirectory))
  .filter(
    (file) =>
      file.toLowerCase().endsWith(".xlsx") &&
      !file.startsWith("~$") &&
      file !== basename(previousStagingPath),
  )
  .sort();
const alreadyProcessedFiles = readProcessedSourceFiles(previousStagingPath);
const newSourceFiles = sourceFiles.filter(
  (file) => !alreadyProcessedFiles.has(file),
);
if (!newSourceFiles.length) {
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", newSourceFiles: [] }, null, 2));
  process.exit(0);
}

const { directory, fingerprint } =
  await loadAllIndiaPostalDirectory();
const sql = neon(databaseUrl);
const existingDealers = await sql`
  SELECT dealer.id, dealer.name, dealer.pincode,
         person.normalized_name AS salesperson
  FROM dealers AS dealer
  JOIN salespeople AS person ON person.id = dealer.salesperson_id
`;
const existingByIdentity = new Map(
  existingDealers.map((dealer) => [
    sourceDealerIdentity(String(dealer.name), String(dealer.pincode)),
    {
      id: Number(dealer.id),
      salesperson: String(dealer.salesperson),
    },
  ]),
);

const parsedRows: ParsedSourceRow[] = [];
const initialReviews: ReviewRow[] = [];
let markerRowsSkipped = 0;

for (const sourceFile of newSourceFiles) {
  const salesperson = salespersonFromSourceFilename(sourceFile);
  if (!salesperson) throw new Error(`Could not derive a salesperson from ${sourceFile}.`);
  const workbook = XLSX.readFile(join(rawDirectory, sourceFile));
  for (const sourceSheet of workbook.SheetNames) {
    const sheet = workbook.Sheets[sourceSheet];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      defval: "",
      header: 1,
      raw: false,
    });
    const headerIndex = rows.findIndex((row) => {
      const normalized = row.map((value) => String(value).trim().toUpperCase());
      return ["ACCOUNT NAME", "CITY", "PINCODE"].every((header) =>
        normalized.includes(header),
      );
    });
    if (headerIndex < 0) {
      throw new Error(`${sourceFile} / ${sourceSheet} is missing the expected Account Name, City, and Pincode headers.`);
    }
    const header = rows[headerIndex].map((value) => String(value).trim().toUpperCase());
    const dealerColumn = header.indexOf("ACCOUNT NAME");
    const areaColumn = header.indexOf("CITY");
    const pincodeColumn = header.indexOf("PINCODE");
    rows.slice(headerIndex + 1).forEach((row, index) => {
      const dealer = normalizeSourceDealerName(row[dealerColumn]);
      const area = normalizeSourceArea(row[areaColumn]);
      const { raw, pincode } = normalizeSourcePincode(row[pincodeColumn]);
      const sourceRow = headerIndex + index + 2;
      if (!dealer && !area && !raw) return;
      if (isSalespersonMarkerRow({ dealer, area, pincode })) {
        markerRowsSkipped += 1;
        return;
      }
      const base = {
        salesperson,
        dealer,
        pincode,
        area,
        sourceFile,
        sourceSheet,
        sourceRow,
      };
      if (!dealer) {
        initialReviews.push({
          ...base,
          state: "",
          reviewCategory: "Missing dealer name",
          reviewDetail: "The source row has no dealer name.",
        });
      } else if (!raw) {
        initialReviews.push({
          ...base,
          state: "",
          reviewCategory: "Missing PIN code",
          reviewDetail: "The source row has no PIN code.",
        });
      } else if (!/^\d{6}$/.test(pincode)) {
        initialReviews.push({
          ...base,
          state: "",
          reviewCategory: "Malformed PIN",
          reviewDetail: `“${raw}” does not resolve to a six-digit PIN code.`,
        });
      } else if (!area) {
        initialReviews.push({
          ...base,
          state: "",
          reviewCategory: "Missing area",
          reviewDetail: "The source row has no city or area value.",
        });
      } else {
        parsedRows.push(base);
      }
    });
  }
}

const directoryCandidates: Array<ParsedSourceRow & { state: IndianState }> = [];
for (const row of parsedRows) {
  const entries = directory.records[row.pincode];
  const states = entries
    ? (Object.keys(entries).filter(Boolean) as IndianState[])
    : [];
  if (!states.length) {
    initialReviews.push({
      ...row,
      state: "",
      reviewCategory: "PIN not in all-India directory",
      reviewDetail: `PIN ${row.pincode} is absent from the current Department of Posts directory.`,
    });
  } else if (states.length > 1) {
    const exactStateMatches = states.filter(
      (state) =>
        validatePostalDetails(directory, row.pincode, state, row.area).status ===
        "verified",
    );
    if (exactStateMatches.length === 1) {
      directoryCandidates.push({ ...row, state: exactStateMatches[0] });
    } else {
      initialReviews.push({
        ...row,
        state: states.join(" / "),
        reviewCategory: "Ambiguous PIN state",
        reviewDetail: `PIN ${row.pincode} appears under multiple states: ${states.join(", ")}.`,
      });
    }
  } else {
    directoryCandidates.push({ ...row, state: states[0] });
  }
}

const groupedByIdentity = new Map<string, typeof directoryCandidates>();
for (const row of directoryCandidates) {
  const identity = sourceDealerIdentity(row.dealer, row.pincode);
  groupedByIdentity.set(identity, [...(groupedByIdentity.get(identity) ?? []), row]);
}

const deduplicated: typeof directoryCandidates = [];
let duplicateRowsRemoved = 0;
for (const [identity, rows] of groupedByIdentity) {
  const owners = [...new Set(rows.map((row) => row.salesperson))];
  if (owners.length > 1) {
    for (const row of rows) {
      initialReviews.push({
        ...row,
        reviewCategory: "Source ownership conflict",
        reviewDetail: `${identity.split("|")[0]} at PIN ${row.pincode} appears under ${owners.join(" and ")}. Choose one salesperson owner.`,
      });
    }
    continue;
  }
  deduplicated.push(rows[0]);
  duplicateRowsRemoved += rows.length - 1;
}

const newCandidates: typeof directoryCandidates = [];
let existingRowsSkipped = 0;
for (const row of deduplicated) {
  const existing = existingByIdentity.get(
    sourceDealerIdentity(row.dealer, row.pincode),
  );
  if (!existing) {
    newCandidates.push(row);
  } else if (existing.salesperson === row.salesperson) {
    existingRowsSkipped += 1;
  } else {
    initialReviews.push({
      ...row,
      reviewCategory: "Existing owner conflict",
      reviewDetail: `${row.dealer} at PIN ${row.pincode} is already assigned to ${existing.salesperson}. Reassign the existing dealer explicitly if ${row.salesperson} should own it.`,
    });
  }
}

const importReady: ImportReadyRow[] = [];
const pinBoundaries = await fetchPinBoundaries(newCandidates.map((row) => row.pincode));
for (const row of newCandidates) {
  const matchingFeatures = (pinBoundaries.get(row.pincode) ?? []).filter((feature) =>
    normalizeIndianState(String(feature.properties.state ?? "")) === row.state);
  const location = matchingFeatures.length === 1
    ? pointInsidePinFeature(matchingFeatures[0]) : null;
  const coordinates = location ? { latitude: location[1], longitude: location[0] } : null;
  if (!coordinates) {
    initialReviews.push({
      ...row,
      reviewCategory: "PIN location needs review",
      reviewDetail: `PIN ${row.pincode} is valid in the postal directory, but no single matching ${row.state} PIN boundary provides a reliable approximate point.`,
    });
    continue;
  }
  const validation = validatePostalDetails(
    directory,
    row.pincode,
    row.state,
    row.area,
  );
  importReady.push({
    ...row,
    canonicalArea: canonicalizeAreaName(row.area),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    validationStatus: validation.status === "verified" ? "verified" : "review",
    reviewNote: validation.status === "review" ? validation.message : null,
    postalSuggestions: validation.status === "review" ? validation.suggestions : [],
  });
}

const sourceSalespeople = [...new Set([
  ...importReady.map((row) => row.salesperson),
  ...initialReviews.map((row) => row.salesperson),
])].sort();
const summary = {
  mode: apply ? "apply" : "dry-run",
  newSourceFiles,
  sourceRows: parsedRows.length + initialReviews.filter((row) =>
    ["Missing dealer name", "Missing PIN code", "Malformed PIN", "Missing area"].includes(row.reviewCategory),
  ).length,
  markerRowsSkipped,
  importReady: importReady.length,
  mappedNeedsReview: importReady.filter((row) => row.validationStatus === "review").length,
  mappedVerified: importReady.filter((row) => row.validationStatus === "verified").length,
  reviewQueue: initialReviews.length,
  reviewCategories: countBy(initialReviews, (row) => row.reviewCategory),
  reviewExamples: initialReviews.slice(0, 25).map((row) => ({
    source: `${row.sourceFile}:${row.sourceRow}`,
    dealer: row.dealer,
    area: row.area,
    pincode: row.pincode,
    state: row.state,
    category: row.reviewCategory,
  })),
  reviewExamplesByCategory: Object.fromEntries(
    [...new Set(initialReviews.map((row) => row.reviewCategory))]
      .sort()
      .map((category) => [
        category,
        initialReviews
          .filter((row) => row.reviewCategory === category)
          .slice(0, 20)
          .map((row) => ({
            source: `${row.sourceFile}:${row.sourceRow}`,
            dealer: row.dealer,
            area: row.area,
            pincode: row.pincode,
            state: row.state,
          })),
      ]),
  ),
  duplicateRowsRemoved,
  existingRowsSkipped,
  states: countBy(importReady, (row) => row.state),
  salespeople: Object.fromEntries(
    sourceSalespeople.map((salesperson) => [
      salesperson,
      {
        importReady: importReady.filter((row) => row.salesperson === salesperson).length,
        mappedNeedsReview: importReady.filter(
          (row) => row.salesperson === salesperson && row.validationStatus === "review",
        ).length,
        reviewQueue: initialReviews.filter((row) => row.salesperson === salesperson).length,
      },
    ]),
  ),
  postalDataset: {
    authority: directory.meta.sourceAuthority,
    catalog: directory.meta.sourceCatalog,
    fingerprint,
  },
};

if (!apply) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

await mkdir(backupDirectory, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = join(
  backupDirectory,
  `database-backup-before-incremental-dealer-import-${timestamp}.json`,
);
const [salespeopleBackup, dealersBackup, rulesBackup, reviewsBackup] =
  await Promise.all([
    sql`SELECT * FROM salespeople ORDER BY id`,
    sql`SELECT * FROM dealers ORDER BY id`,
    sql`SELECT * FROM visit_rules ORDER BY id`,
    sql`SELECT * FROM dealer_import_reviews ORDER BY id`,
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
      dealerImportReviews: reviewsBackup,
    },
    null,
    2,
  ),
  "utf8",
);

for (const salesperson of sourceSalespeople) {
  await sql`
    INSERT INTO salespeople (normalized_name, display_name, color, active)
    VALUES (
      ${salesperson},
      ${displayName(salesperson)},
      ${SALESPERSON_COLORS[salesperson] ?? "#475569"},
      true
    )
    ON CONFLICT (normalized_name) DO UPDATE SET
      display_name = excluded.display_name,
      color = excluded.color,
      active = true,
      updated_at = now()
  `;
}

for (let index = 0; index < importReady.length; index += 150) {
  const payload = importReady.slice(index, index + 150);
  await sql.query(
    `
      WITH input AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(
          salesperson text,
          dealer text,
          pincode text,
          "canonicalArea" text,
          area text,
          state text,
          latitude double precision,
          longitude double precision,
          "validationStatus" text,
          "reviewNote" text,
          "postalSuggestions" jsonb
        )
      )
      INSERT INTO dealers (
        salesperson_id, name, pincode, area, source_area, state,
        latitude, longitude, location_precision, review_note,
        postal_suggestions, validation_status, validation_source,
        validation_checked_at, validation_dataset, updated_at
      )
      SELECT
        person.id,
        input.dealer,
        input.pincode,
        input."canonicalArea",
        input.area,
        input.state::state,
        input.latitude,
        input.longitude,
        'pincode'::location_precision,
        input."reviewNote",
        input."postalSuggestions",
        input."validationStatus"::validation_status,
        'postal-directory'::validation_source,
        now(),
        $2,
        now()
      FROM input
      JOIN salespeople AS person ON person.normalized_name = input.salesperson
      ON CONFLICT (name, pincode) DO NOTHING
    `,
    [JSON.stringify(payload), fingerprint],
  );
}

await sql`
  INSERT INTO visit_rules (dealer_id, frequency_days, service_minutes, priority)
  SELECT dealer.id, 30, 30, 3
  FROM dealers AS dealer
  ON CONFLICT (dealer_id) DO NOTHING
`;

for (let index = 0; index < initialReviews.length; index += 100) {
  const payload = initialReviews.slice(index, index + 100);
  await sql.query(
    `
      WITH input AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS row(
          salesperson text,
          dealer text,
          pincode text,
          area text,
          state text,
          "reviewCategory" text,
          "reviewDetail" text,
          "sourceFile" text,
          "sourceSheet" text,
          "sourceRow" integer
        )
      )
      INSERT INTO dealer_import_reviews (
        salesperson_id, name, pincode, area, state,
        review_category, review_detail, source_file, source_sheet, source_row
      )
      SELECT
        person.id,
        input.dealer,
        nullif(input.pincode, ''),
        nullif(input.area, ''),
        nullif(input.state, ''),
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
        review_category = excluded.review_category,
        review_detail = excluded.review_detail,
        updated_at = now()
      WHERE dealer_import_reviews.status = 'pending'
    `,
    [JSON.stringify(payload)],
  );
}

const [after] = await sql`
  SELECT
    (SELECT count(*)::int FROM dealers) AS dealers,
    (SELECT count(*)::int FROM dealer_import_reviews WHERE status = 'pending') AS pending_reviews,
    (SELECT count(*)::int FROM visit_rules) AS visit_rules,
    (SELECT count(*)::int FROM salespeople WHERE active) AS active_salespeople,
    (SELECT count(*)::int FROM dealers WHERE validation_status = 'review') AS mapped_reviews
`;
console.log(JSON.stringify({ ...summary, backupPath, after }, null, 2));

function readProcessedSourceFiles(stagingPath: string) {
  const workbook = XLSX.readFile(stagingPath);
  const processed = new Set<string>();
  for (const sheetName of ["Import ready", "Review", "Duplicate removed"]) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
    for (const row of rows) {
      const sourceFile = String(row["SOURCE FILE"] ?? "").trim();
      if (sourceFile) processed.add(sourceFile);
    }
  }
  return processed;
}

async function loadAllIndiaPostalDirectory() {
  const response = await fetch(postalMirror);
  if (!response.ok) {
    throw new Error(`Postal directory download failed (${response.status}).`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const workbook = XLSX.read(bytes, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<PostalSourceRow>(sheet, { defval: "" });
  const grouped = new Map<
    string,
    {
      state: IndianState;
      districts: Set<string>;
      offices: Set<string>;
      blocks: Set<string>;
    }
  >();
  for (const row of rows) {
    const sourceState = String(row.StateName ?? "")
      .replace(/^THE\s+/i, "")
      .trim();
    const state = normalizeIndianState(sourceState);
    const pincode = String(row.Pincode ?? "").replace(/\D/g, "").slice(0, 6);
    if (!state || !/^\d{6}$/.test(pincode)) continue;
    const key = `${pincode}|${state}`;
    const current = grouped.get(key) ?? {
      state,
      districts: new Set<string>(),
      offices: new Set<string>(),
      blocks: new Set<string>(),
    };
    addText(current.districts, row.District);
    addText(current.offices, row.OfficeName);
    addText(current.blocks, row.Block ?? row.Taluk);
    grouped.set(key, current);

  }

  const records: PostalDirectory["records"] = {};
  for (const [key, value] of grouped) {
    const [pincode] = key.split("|");
    records[pincode] ??= {};
    records[pincode][value.state] = {
      state: value.state,
      districts: [...value.districts].sort(),
      offices: [...value.offices].sort(),
      blocks: [...value.blocks].sort(),
    } satisfies PostalDirectoryEntry;
  }
  const fingerprint = createHash("sha256").update(bytes).digest("hex");
  const directory: PostalDirectory = {
    meta: {
      generatedAt: new Date().toISOString(),
      retrievedAt: new Date().toISOString().slice(0, 10),
      sourceAuthority: "Ministry of Communications, Department of Posts",
      sourceCatalog: postalCatalog,
      deliveryMirror: postalMirror,
      license: "Government Open Data License - India",
      sourceSha256: fingerprint,
      scope: "India",
    },
    records,
  };
  return { directory, fingerprint };
}

function addText(target: Set<string>, value: unknown) {
  const text = String(value ?? "").trim();
  if (text && text.toUpperCase() !== "NA") target.add(text);
}

function countBy<T>(rows: T[], keyFor: (row: T) => string) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = keyFor(row) || "Unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function displayName(normalized: string) {
  return normalized
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
