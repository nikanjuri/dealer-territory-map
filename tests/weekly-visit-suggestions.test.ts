import assert from "node:assert/strict";
import test from "node:test";
import type { DealerSummary } from "../lib/dealer-summary.ts";
import type { DealerSchedule, SavedRoutePlan } from "../lib/route-contract.ts";
import { suggestVisitWeek } from "../lib/weekly-visit-suggestions.ts";

const dealer = (id: number, pincode: string) => ({
  id, dealer: `Dealer ${id}`, salesperson: "KIRAN", pincode,
  area: "Hyderabad", state: "Telangana", latitude: 17.4, longitude: 78.5,
  locationPrecision: "address", validationStatus: "verified",
}) as DealerSummary;

test("weekly suggestions respect due dates, existing plans, capacity, and PIN grouping", () => {
  const schedules: DealerSchedule[] = [
    { dealerId: 1, frequencyDays: 30, nextDueAt: "2026-09-25", lastCompletedAt: "2026-08-26T00:00:00Z" },
    { dealerId: 2, frequencyDays: 30, nextDueAt: "2026-09-27", lastCompletedAt: "2026-08-28T00:00:00Z" },
    { dealerId: 3, frequencyDays: 30, nextDueAt: "2026-10-20", lastCompletedAt: "2026-09-20T00:00:00Z" },
  ];
  const planned = [{ routeDate: "2026-09-26", status: "optimized", stops: [{ dealerId: 4 }] }] as SavedRoutePlan[];
  const result = suggestVisitWeek({
    startDate: "2026-09-26", dealers: [dealer(1, "500001"), dealer(2, "500001"), dealer(3, "500002"), dealer(4, "500003")],
    schedules, plans: planned, dailyTarget: 1,
  });
  assert.equal(result.dueCount, 2);
  assert.deepEqual(result.days[0].dealerIds, [1]);
  assert.deepEqual(result.days[1].dealerIds, [2]);
  assert.equal(result.unplaced, 0);
});
