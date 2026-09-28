import assert from "node:assert/strict";
import test from "node:test";

import type { Dealer } from "../app/dealers.ts";
import { buildGoogleMapsRouteSegments } from "../lib/google-maps-url.ts";
import {
  buildGoogleRoutesRequest,
  parseGoogleRoute,
} from "../lib/google-routes-core.ts";
import { routePlanRequestSchema } from "../lib/route-contract.ts";
import { buildRouteSchedule } from "../lib/route-schedule.ts";

test("turns an exact-address plan into a scheduled, mobile-safe route", () => {
  const parsed = routePlanRequestSchema.parse({
    salesperson: "KIRAN",
    routeDate: "2026-09-20",
    startAddress: "Hyderabad office",
    returnToStart: true,
    workdayStart: "09:00",
    workdayEnd: "18:00",
    dealerIds: [1, 2, 3, 4, 5],
    includeApproximate: false,
  });
  const dealers: Dealer[] = parsed.dealerIds.map((id) => ({
    id,
    salesperson: "KIRAN",
    dealer: `Dealer ${id}`,
    pincode: `50000${id}`,
    area: "HYDERABAD",
    address: `${id} Market Road, Hyderabad, Telangana 50000${id}`,
    state: "Telangana",
    latitude: 17.3 + id / 100,
    longitude: 78.4 + id / 100,
    locationPrecision: "address",
    googlePlaceId: `place-${id}`,
  }));

  const googleRequest = buildGoogleRoutesRequest(
    parsed,
    dealers,
    new Date("2026-09-19T00:00:00.000Z"),
  );
  assert.equal(googleRequest.intermediates.length, 5);
  assert.equal(googleRequest.departureTime, "2026-09-20T03:30:00.000Z");

  const optimized = parseGoogleRoute(
    {
      routes: [
        {
          optimizedIntermediateWaypointIndex: [4, 3, 2, 1, 0],
          distanceMeters: 30_000,
          duration: "7200s",
          legs: Array.from({ length: 6 }, () => ({
            distanceMeters: 5_000,
            duration: "1200s",
          })),
        },
      ],
    },
    dealers,
  );
  const schedule = buildRouteSchedule({
    request: parsed,
    optimized,
    dealers: dealers.map((dealer) => ({
      id: dealer.id,
      serviceMinutes: 30,
    })),
  });
  assert.equal(schedule.fitsWorkday, true);
  assert.deepEqual(optimized.dealerIds, [5, 4, 3, 2, 1]);

  const savedPlan = {
    id: 1,
    salesperson: parsed.salesperson,
    routeDate: parsed.routeDate,
    status: "optimized" as const,
    startAddress: parsed.startAddress,
    endAddress: parsed.startAddress,
    optimizationProvider: "google-routes",
    totalDistanceMeters: optimized.totalDistanceMeters,
    totalDurationSeconds: optimized.totalDurationSeconds,
    totalServiceSeconds: schedule.totalServiceSeconds,
    totalPlannedSeconds: schedule.totalPlannedSeconds,
    estimatedEndAt: schedule.estimatedEndAt.toISOString(),
    warning: null,
    stops: schedule.stops.map((stop, index) => ({
      id: index + 1,
      dealerId: stop.dealerId,
      sequence: stop.sequence,
      plannedArrivalAt: stop.plannedArrivalAt.toISOString(),
      plannedDepartureAt: stop.plannedDepartureAt.toISOString(),
      travelSeconds: stop.travelSeconds,
      travelMeters: stop.travelMeters,
      status: "planned" as const,
    })),
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
  };
  const segments = buildGoogleMapsRouteSegments(
    savedPlan,
    new Map(dealers.map((dealer) => [dealer.id, dealer])),
  );
  assert.equal(segments.length, 2);
  assert.deepEqual(
    segments.map(({ stopStart, stopEnd }) => [stopStart, stopEnd]),
    [
      [1, 4],
      [5, 5],
    ],
  );
});
