import assert from "node:assert/strict";
import test from "node:test";

import type { Dealer } from "../app/dealers.ts";
import type { SavedRoutePlan } from "../lib/route-contract.ts";
import { buildGoogleMapsRouteSegments } from "../lib/google-maps-url.ts";

function makePlan(stopCount: number): SavedRoutePlan {
  return {
    id: 1,
    salesperson: "KIRAN",
    routeDate: "2026-09-20",
    status: "optimized",
    startAddress: "Start office",
    endAddress: "End office",
    optimizationProvider: "google-routes",
    totalDistanceMeters: 20_000,
    totalDurationSeconds: 3_600,
    totalServiceSeconds: stopCount * 1_800,
    totalPlannedSeconds: 3_600 + stopCount * 1_800,
    estimatedEndAt: "2026-09-20T10:30:00.000Z",
    warning: null,
    stops: Array.from({ length: stopCount }, (_, index) => ({
      id: index + 1,
      dealerId: index + 1,
      sequence: index + 1,
      plannedArrivalAt: null,
      plannedDepartureAt: null,
      travelSeconds: 300,
      travelMeters: 1_000,
      status: "planned",
    })),
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
  };
}

function makeDealers(count: number) {
  return new Map<number, Dealer>(
    Array.from({ length: count }, (_, index) => {
      const id = index + 1;
      return [
        id,
        {
          id,
          salesperson: "KIRAN",
          dealer: `Dealer ${id}`,
          pincode: `50000${id}`,
          area: "HYDERABAD",
          state: "Telangana",
          latitude: 17 + id / 100,
          longitude: 78 + id / 100,
        },
      ];
    }),
  );
}

test("uses one Maps URL for a route with no more than three stops", () => {
  const segments = buildGoogleMapsRouteSegments(makePlan(3), makeDealers(3));
  assert.equal(segments.length, 1);
  const url = new URL(segments[0].href);
  assert.equal(url.searchParams.get("origin"), "Start office");
  assert.equal(url.searchParams.get("destination"), "End office");
  assert.equal(url.searchParams.get("waypoints")?.split("|").length, 3);
});

test("splits a long route into ordered mobile-safe Maps URLs", () => {
  const segments = buildGoogleMapsRouteSegments(makePlan(10), makeDealers(10));
  assert.equal(segments.length, 3);
  for (const segment of segments) {
    const url = new URL(segment.href);
    const waypointCount = url.searchParams.get("waypoints")?.split("|").length ?? 0;
    assert.ok(waypointCount <= 3);
  }
  const second = new URL(segments[1].href);
  assert.equal(second.searchParams.get("origin"), "17.04,78.04");
  assert.deepEqual(
    segments.map(({ stopStart, stopEnd }) => [stopStart, stopEnd]),
    [
      [1, 4],
      [5, 8],
      [9, 10],
    ],
  );
});

test("adds a finish leg when a four-stop segment uses its destination slot", () => {
  const segments = buildGoogleMapsRouteSegments(makePlan(4), makeDealers(4));
  assert.equal(segments.length, 2);
  assert.equal(segments[1].label, "Part 2 · finish");
  const finish = new URL(segments[1].href);
  assert.equal(finish.searchParams.get("origin"), "17.04,78.04");
  assert.equal(finish.searchParams.get("destination"), "End office");
  assert.equal(finish.searchParams.has("waypoints"), false);
});
