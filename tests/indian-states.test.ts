import assert from "node:assert/strict";
import test from "node:test";

import { dealerInputSchema } from "../lib/dealer-contract.ts";
import { dealerReviewUpdateSchema } from "../lib/dealer-review-contract.ts";
import { makeImportDraft } from "../lib/import-normalization.ts";
import { normalizeIndianState } from "../lib/indian-states.ts";

test("normalizes state names and common postal abbreviations", () => {
  assert.equal(normalizeIndianState("KA"), "Karnataka");
  assert.equal(normalizeIndianState("andhra-pradesh"), "Andhra Pradesh");
  assert.equal(normalizeIndianState("Pondicherry"), "Puducherry");
  assert.equal(normalizeIndianState("unknown"), null);
});

test("accepts Karnataka dealers throughout the import contract", () => {
  const draft = makeImportDraft(
    {
      "SALES PERSON": "Kiran",
      "DEALER NAME": "Example",
      PINCODE: "585101",
      AREA: "Kalaburagi",
      STATE: "Karnataka",
    },
    0,
  );
  assert.equal(draft.state, "Karnataka");
  assert.equal(
    dealerInputSchema.safeParse({
      ...draft,
      latitude: 17.33,
      longitude: 76.83,
    }).success,
    true,
  );
});

test("allows incomplete review records while they remain off the map", () => {
  assert.equal(
    dealerReviewUpdateSchema.safeParse({
      salesperson: "CHANDAR",
      dealer: "Example Textiles",
      pincode: "",
      area: "Secunderabad",
      address: "",
      state: "",
    }).success,
    true,
  );
});
