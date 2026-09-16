import assert from "node:assert/strict";
import test from "node:test";
import { dealerInputSchema, dealerUpdateSchema } from "../lib/dealer-contract.ts";

const validDealer = {
  salesperson: "KIRAN",
  dealer: "SRI BALAJI KHADI",
  pincode: "500001",
  area: "HYDERABAD GPO",
  state: "Telangana" as const,
  latitude: 17.3988564,
  longitude: 78.4722552,
};

test("accepts the shared dealer contract and normalizes blank optional text", () => {
  const result = dealerInputSchema.parse({ ...validDealer, address: "   " });
  assert.equal(result.address, undefined);
  assert.equal(result.locationPrecision, undefined);
});

test("rejects invalid coordinates and non-six-digit PIN codes", () => {
  assert.equal(
    dealerInputSchema.safeParse({
      ...validDealer,
      pincode: "50001",
      latitude: 120,
    }).success,
    false,
  );
});

test("requires a positive database id for updates", () => {
  assert.equal(dealerUpdateSchema.safeParse({ ...validDealer, id: 0 }).success, false);
  assert.equal(dealerUpdateSchema.safeParse({ ...validDealer, id: 12 }).success, true);
});
