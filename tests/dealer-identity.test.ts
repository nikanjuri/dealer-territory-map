import assert from "node:assert/strict";
import test from "node:test";
import { dealerIdentitiesMatch } from "../lib/dealer-identity.ts";

test("matching dealer and PIN is one identity regardless of salesperson", () => {
  assert.equal(
    dealerIdentitiesMatch(
      { dealer: "Sri Balaji Khadi", pincode: "500001" },
      { dealer: " SRI   BALAJI KHADI ", pincode: "500001" },
    ),
    true,
  );
});

test("matching dealer and full address catches a conflicting PIN", () => {
  assert.equal(
    dealerIdentitiesMatch(
      {
        dealer: "Sri Balaji Khadi",
        pincode: "500002",
        address: "1 Main Road, Hyderabad",
      },
      {
        dealer: "SRI BALAJI KHADI",
        pincode: "500001",
        address: " 1 main road,   Hyderabad ",
      },
    ),
    true,
  );
});

test("same name at a different PIN and address remains a separate dealer", () => {
  assert.equal(
    dealerIdentitiesMatch(
      {
        dealer: "Textile House",
        pincode: "500001",
        address: "Abids",
      },
      {
        dealer: "Textile House",
        pincode: "506001",
        address: "Hanamkonda",
      },
    ),
    false,
  );
});
