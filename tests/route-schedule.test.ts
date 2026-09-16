import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRouteSchedule,
  googleDepartureTime,
  indiaDateTime,
  serializePlannedRouteStops,
} from "../lib/route-schedule.ts";

const request = {
  routeDate: "2026-09-20",
  workdayStart: "09:00",
  workdayEnd: "18:00",
};

test("converts an India workday to an absolute instant", () => {
  assert.equal(
    indiaDateTime("2026-09-20", "09:00").toISOString(),
    "2026-09-20T03:30:00.000Z",
  );
});

test("sends Google a planned departure only when it is still in the future", () => {
  assert.equal(
    googleDepartureTime(request, new Date("2026-09-19T00:00:00.000Z")),
    "2026-09-20T03:30:00.000Z",
  );
  assert.equal(
    googleDepartureTime(request, new Date("2026-09-21T00:00:00.000Z")),
    undefined,
  );
});

test("includes dealer service time when checking the workday", () => {
  const schedule = buildRouteSchedule({
    request,
    optimized: {
      dealerIds: [2, 1],
      legMeters: [4_000, 6_000, 5_000],
      legSeconds: [1_200, 1_800, 1_500],
      totalDistanceMeters: 15_000,
      totalDurationSeconds: 4_500,
    },
    dealers: [
      { id: 1, serviceMinutes: 45 },
      { id: 2, serviceMinutes: 30 },
    ],
  });

  assert.equal(schedule.totalServiceSeconds, 4_500);
  assert.equal(schedule.totalPlannedSeconds, 9_000);
  assert.equal(schedule.fitsWorkday, true);
  assert.equal(schedule.estimatedEndAt.toISOString(), "2026-09-20T06:00:00.000Z");
  assert.equal(schedule.stops[0].plannedArrivalAt.toISOString(), "2026-09-20T03:50:00.000Z");
  assert.equal(schedule.stops[1].plannedArrivalAt.toISOString(), "2026-09-20T04:50:00.000Z");
  assert.deepEqual(JSON.parse(serializePlannedRouteStops(schedule.stops))[0], {
    dealer_id: 2,
    sequence: 1,
    planned_arrival_at: "2026-09-20T03:50:00.000Z",
    planned_departure_at: "2026-09-20T04:20:00.000Z",
    travel_seconds: 1_200,
    travel_meters: 4_000,
  });
});

test("reports the amount by which a route exceeds the selected workday", () => {
  const schedule = buildRouteSchedule({
    request: { ...request, workdayEnd: "10:00" },
    optimized: {
      dealerIds: [1],
      legMeters: [1_000, 1_000],
      legSeconds: [1_800, 1_800],
      totalDistanceMeters: 2_000,
      totalDurationSeconds: 3_600,
    },
    dealers: [{ id: 1, serviceMinutes: 30 }],
  });

  assert.equal(schedule.fitsWorkday, false);
  assert.equal(schedule.overrunSeconds, 1_800);
});
