import assert from "node:assert/strict";
import test from "node:test";

import {
  isImportDraftValid,
  makeImportDraft,
  parseExtractedText,
} from "../lib/import-normalization.ts";

test("accepts a full-address alias without making it required", () => {
  const withAddress = makeImportDraft(
    {
      employee: "Kiran",
      storeName: "Example Textiles",
      pinCode: "500 001",
      locality: "Nampally",
      stateName: "TS",
      dealerAddress: "12 Market Road",
    },
    0,
  );

  assert.equal(withAddress.address, "12 Market Road");
  assert.equal(withAddress.state, "Telangana");
  assert.equal(withAddress.pincode, "500001");
  assert.equal(isImportDraftValid(withAddress), true);

  const withoutAddress = { ...withAddress, address: "" };
  assert.equal(isImportDraftValid(withoutAddress), true);
});

test("keeps legacy five-column OCR rows compatible", () => {
  const [row] = parseExtractedText(
    "SALES PERSON|DEALER NAME|PINCODE|AREA|STATE\nKIRAN|EXAMPLE|500001|NAMPALLY|TELANGANA",
  );

  assert.equal(row.dealer, "EXAMPLE");
  assert.equal(row.address, "");
  assert.equal(isImportDraftValid(row), true);
});

test("extracts an optional sixth full-address column", () => {
  const [row] = parseExtractedText(
    "SALES PERSON|DEALER NAME|PINCODE|AREA|STATE|FULL ADDRESS\nKIRAN|EXAMPLE|500001|NAMPALLY|TELANGANA|12 MARKET ROAD",
  );

  assert.equal(row.address, "12 MARKET ROAD");
});
