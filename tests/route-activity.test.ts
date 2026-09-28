import assert from "node:assert/strict";
import test from "node:test";
import type { Dealer } from "../app/dealers.ts";
import { buildTeamRouteActivity } from "../lib/route-activity.ts";
import type { SavedRoutePlan } from "../lib/route-contract.ts";

const dealers = [
  { id: 1, salesperson: "KIRAN", dealer: "One", pincode: "500001", area: "A", state: "Telangana", latitude: 17, longitude: 78 },
  { id: 2, salesperson: "MADHU", dealer: "Two", pincode: "500002", area: "B", state: "Telangana", latitude: 17, longitude: 78 },
] satisfies Dealer[];

function plan(overrides: Partial<SavedRoutePlan>): SavedRoutePlan {
  return {
    id: 1,
    salesperson: "KIRAN",
    routeDate: "2026-09-16",
    status: "in_progress",
    startAddress: "Depot",
    endAddress: "Depot",
    optimizationProvider: "google-routes",
    totalDistanceMeters: 1000,
    totalDurationSeconds: 600,
    totalServiceSeconds: 1800,
    totalPlannedSeconds: 2400,
    estimatedEndAt: "2026-09-16T05:00:00.000Z",
    warning: null,
    stops: [
      {
        id: 1,
        dealerId: 1,
        sequence: 1,
        plannedArrivalAt: "2026-09-16T03:30:00.000Z",
        plannedDepartureAt: "2026-09-16T04:00:00.000Z",
        travelSeconds: 600,
        travelMeters: 1000,
        status: "completed",
      },
    ],
    createdAt: "2026-09-16T03:00:00.000Z",
    updatedAt: "2026-09-16T04:00:00.000Z",
    ...overrides,
  };
}

test("shows every active salesperson and puts missing routes first", () => {
  const rows = buildTeamRouteActivity({
    people: [
      { displayName: "Kiran", normalizedName: "KIRAN", color: "#f00", active: true },
      { displayName: "Madhu", normalizedName: "MADHU", color: "#00f", active: true },
    ],
    dealers,
    schedules: [],
    plans: [plan({})],
    routeDate: "2026-09-16",
    today: "2026-09-16",
    now: new Date("2026-09-16T02:00:00.000Z"),
  });

  assert.deepEqual(rows.map((row) => row.displayName), ["Madhu", "Kiran"]);
  assert.equal(rows[0].state, "no-route");
  assert.equal(rows[1].state, "active");
});

test("flags unfinished past routes for attention", () => {
  const rows = buildTeamRouteActivity({
    people: [{ displayName: "Kiran", normalizedName: "KIRAN", color: "#f00" }],
    dealers,
    schedules: [],
    plans: [
      plan({
        routeDate: "2026-09-15",
        status: "optimized",
        stops: [
          {
            id: 1,
            dealerId: 1,
            sequence: 1,
            plannedArrivalAt: "2026-09-15T03:30:00.000Z",
            plannedDepartureAt: "2026-09-15T04:00:00.000Z",
            travelSeconds: 600,
            travelMeters: 1000,
            status: "planned",
          },
        ],
      }),
    ],
    routeDate: "2026-09-15",
    today: "2026-09-16",
    now: new Date("2026-09-16T05:00:00.000Z"),
  });

  assert.equal(rows[0].state, "attention");
  assert.equal(rows[0].delayedStops, 1);
});
