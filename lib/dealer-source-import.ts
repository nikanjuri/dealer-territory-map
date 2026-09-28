import { basename } from "node:path";

export function salespersonFromSourceFilename(filePath: string) {
  return basename(filePath)
    .replace(/\.xlsx$/i, "")
    .replace(/\bsales\s*man\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function normalizeSourceDealerName(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function normalizeSourceArea(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeSourcePincode(value: unknown) {
  const raw = String(value ?? "").replace(/\.0$/, "").trim();
  return {
    raw,
    pincode: raw.replace(/\D/g, ""),
  };
}

export function isSalespersonMarkerRow(input: {
  dealer: string;
  area: string;
  pincode: string;
}) {
  return Boolean(
    input.dealer.includes("SALESMAN") && !input.area && !input.pincode,
  );
}

export function sourceDealerIdentity(dealer: string, pincode: string) {
  return `${normalizeSourceDealerName(dealer)}|${pincode}`;
}
