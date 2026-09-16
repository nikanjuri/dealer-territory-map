import assert from "node:assert/strict";
import test from "node:test";
import { routePlanRequestSchema } from "../lib/route-contract.ts";

const validPlan = {
  salesperson: "KIRAN",
  routeDate: "2026-09-15",
  startAddress: "Secunderabad Railway Station, Telangana",
  returnToStart: true,
  workdayStart: "09:00",
  workdayEnd: "18:00",
  dealerIds: [1, 2, 3],
  includeApproximate: true,
};

test("accepts a daily route with selected dealer stops", () => {
  assert.equal(routePlanRequestSchema.safeParse(validPlan).success, true);
});
test("requires an end location for an open route", () => {
  const parsed = routePlanRequestSchema.safeParse({
    ...validPlan,
    returnToStart: false,
  });
  assert.equal(parsed.success, false);
});

test("rejects a backwards workday and more than 25 stops", () => {
  const parsed = routePlanRequestSchema.safeParse({
    ...validPlan,
    workdayStart: "18:00",
    workdayEnd: "09:00",
    dealerIds: Array.from({ length: 26 }, (_, index) => index + 1),
  });
  assert.equal(parsed.success, false);
});
