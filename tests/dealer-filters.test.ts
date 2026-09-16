import assert from "node:assert/strict";
import test from "node:test";

import type { Dealer } from "../app/dealers.ts";
import { filterDealerRecords } from "../lib/dealer-filters.ts";

const dealers: Dealer[] = [
  {
    id: 1,
    salesperson: "KIRAN",
    dealer: "ADDRESS STORE",
    pincode: "500001",
    area: "NAMPALLY",
    address: "12 MARKET ROAD",
    state: "Telangana",
    latitude: 17.39,
    longitude: 78.47,
    locationPrecision: "address",
    validationStatus: "verified",
  },
  {
    id: 2,
    salesperson: "MADHU",
    dealer: "PIN STORE",
    pincode: "520001",
    area: "VIJAYAWADA",
    state: "Andhra Pradesh",
    latitude: 16.51,
    longitude: 80.63,
    locationPrecision: "pincode",
    validationStatus: "review",
  },
];

const defaults = {
  query: "",
  salespeople: ["KIRAN", "MADHU"],
  state: "all" as const,
  quality: "all" as const,
  pincode: "all",
  area: "all",
};

test("combines state, quality, PIN-code, and area filters", () => {
  assert.deepEqual(
    filterDealerRecords(dealers, {
      ...defaults,
      state: "Telangana",
      quality: "verified",
      pincode: "500001",
      area: "NAMPALLY",
    }).map((dealer) => dealer.id),
    [1],
  );
});

test("search includes full address", () => {
  assert.deepEqual(
    filterDealerRecords(dealers, { ...defaults, query: "market road" }).map(
      (dealer) => dealer.id,
    ),
    [1],
  );
});

test("an empty salesperson selection returns no dealers", () => {
  assert.equal(
    filterDealerRecords(dealers, { ...defaults, salespeople: [] }).length,
    0,
  );
});
