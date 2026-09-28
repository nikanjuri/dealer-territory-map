import type { Dealer } from "../app/dealers";
import { normalizeIndianState } from "./indian-states.ts";

export type ImportDraftRow = {
  key: string;
  salesperson: string;
  dealer: string;
  pincode: string;
  area: string;
  state: Dealer["state"] | "";
  address: string;
};

export const IMPORT_COLUMNS = [
  "SALES PERSON",
  "DEALER NAME",
  "PINCODE",
  "AREA",
  "STATE",
  "FULL ADDRESS",
] as const;

export const REQUIRED_IMPORT_COLUMNS = IMPORT_COLUMNS.filter(
  (column) => column !== "FULL ADDRESS",
);

function normalizeImportHeader(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toUpperCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function valueForImportRow(row: Record<string, unknown>, names: string[]) {
  const entry = Object.entries(row).find(([key]) =>
    names.includes(normalizeImportHeader(key)),
  );
  return entry ? String(entry[1]).trim() : "";
}

function normalizeImportedState(value: string): ImportDraftRow["state"] {
  return normalizeIndianState(value) ?? "";
}

export function makeImportDraft(
  row: Record<string, unknown>,
  index: number,
): ImportDraftRow {
  return {
    key: globalThis.crypto?.randomUUID?.() ?? `import-${Date.now()}-${index}`,
    salesperson: valueForImportRow(row, [
      "SALES PERSON",
      "SALESPERSON",
      "EMPLOYEE",
      "EMPLOYEE NAME",
    ]),
    dealer: valueForImportRow(row, ["DEALER NAME", "DEALER", "STORE NAME"]),
    pincode: valueForImportRow(row, ["PINCODE", "PIN CODE", "PIN"]).replace(
      /\D/g,
      "",
    ),
    area: valueForImportRow(row, ["AREA", "AREA NAME", "LOCALITY"]),
    state: normalizeImportedState(
      valueForImportRow(row, ["STATE", "STATE NAME"]),
    ),
    address: valueForImportRow(row, [
      "FULL ADDRESS",
      "ADDRESS",
      "STREET ADDRESS",
      "DEALER ADDRESS",
    ]),
  };
}

export function isImportDraftValid(row: ImportDraftRow) {
  return Boolean(
    row.salesperson &&
      row.dealer &&
      row.area &&
      row.state &&
      /^\d{6}$/.test(row.pincode),
  );
}

function splitExtractedLine(line: string) {
  if (line.includes("\t")) return line.split(/\t+/);
  if (line.includes("|")) return line.split("|");
  if (line.split(",").length >= 5) return line.split(",");
  if (line.split(";").length >= 5) return line.split(";");
  return line.trim().split(/\s{2,}/);
}

export function parseExtractedText(text: string): ImportDraftRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const aliases: Record<(typeof IMPORT_COLUMNS)[number], string[]> = {
    "SALES PERSON": ["SALES PERSON", "SALESPERSON", "EMPLOYEE", "EMPLOYEE NAME"],
    "DEALER NAME": ["DEALER NAME", "DEALER", "STORE NAME"],
    PINCODE: ["PINCODE", "PIN CODE", "PIN"],
    AREA: ["AREA", "AREA NAME", "LOCALITY"],
    STATE: ["STATE", "STATE NAME"],
    "FULL ADDRESS": [
      "FULL ADDRESS",
      "ADDRESS",
      "STREET ADDRESS",
      "DEALER ADDRESS",
    ],
  };
  const tokenized = lines.map(splitExtractedLine);
  const headerIndex = tokenized.findIndex((tokens) => {
    const normalized = tokens.map(normalizeImportHeader);
    return REQUIRED_IMPORT_COLUMNS.every((column) =>
      aliases[column].some((alias) => normalized.includes(alias)),
    );
  });
  const header = headerIndex >= 0 ? tokenized[headerIndex] : [...IMPORT_COLUMNS];
  const normalizedHeader = header.map(normalizeImportHeader);
  const columnIndex = (column: (typeof IMPORT_COLUMNS)[number]) =>
    normalizedHeader.findIndex((value) => aliases[column].includes(value));
  const indexes = Object.fromEntries(
    IMPORT_COLUMNS.map((column) => [column, columnIndex(column)]),
  ) as Record<(typeof IMPORT_COLUMNS)[number], number>;

  return tokenized
    .slice(headerIndex >= 0 ? headerIndex + 1 : 0)
    .filter((tokens) => tokens.length >= REQUIRED_IMPORT_COLUMNS.length)
    .map((tokens, index) =>
      makeImportDraft(
        Object.fromEntries(
          IMPORT_COLUMNS.map((column) => [
            column,
            tokens[
              indexes[column] >= 0
                ? indexes[column]
                : IMPORT_COLUMNS.indexOf(column)
            ] ?? "",
          ]),
        ),
        index,
      ),
    );
}
