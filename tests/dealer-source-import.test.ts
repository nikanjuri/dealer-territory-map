import assert from "node:assert/strict";
import test from "node:test";

import {
  isSalespersonMarkerRow,
  normalizeSourcePincode,
  salespersonFromSourceFilename,
  sourceDealerIdentity,
} from "../lib/dealer-source-import.ts";

test("derives the salesperson from source workbook names", () => {
  assert.equal(salespersonFromSourceFilename("Ghanshyam Salesman.xlsx"), "GHANSHYAM");
  assert.equal(salespersonFromSourceFilename("VIJAY KUMAR SALESMAN.xlsx"), "VIJAY KUMAR");
});

test("accepts spaced PIN formatting while preserving malformed values", () => {
  assert.deepEqual(normalizeSourcePincode("670 002"), {
    raw: "670 002",
    pincode: "670002",
  });
  assert.equal(normalizeSourcePincode("5000").pincode, "5000");
});

test("recognizes the salesperson marker row", () => {
  assert.equal(
    isSalespersonMarkerRow({
      dealer: "OM SHANKAR SALESMAN",
      area: "",
      pincode: "",
    }),
    true,
  );
});

test("uses normalized dealer name and PIN as the source identity", () => {
  assert.equal(
    sourceDealerIdentity("  Sri   Textiles ", "500001"),
    "SRI TEXTILES|500001",
  );
});
