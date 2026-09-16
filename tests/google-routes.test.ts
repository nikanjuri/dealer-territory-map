import assert from "node:assert/strict";
import test from "node:test";

import type { Dealer } from "../app/dealers.ts";
import type { RoutePlanRequest } from "../lib/route-contract.ts";
import {
  buildGoogleRoutesRequest,
  parseGoogleRoute,
  routeEndpoint,
} from "../lib/google-routes-core.ts";

const dealers: Dealer[] = [
  {
    id: 10,
    salesperson: "KIRAN",
    dealer: "PLACE STORE",
    pincode: "500001",
    area: "NAMPALLY",
    state: "Telangana",
    latitude: 17.39,
    longitude: 78.47,
    googlePlaceId: "place-10",
  },
  {
    id: 20,
    salesperson: "KIRAN",
    dealer: "COORDINATE STORE",
    pincode: "500002",
    area: "HYDERABAD",
    state: "Telangana",
    latitude: 17.4,
    longitude: 78.48,
  },
];

const request: RoutePlanRequest = {
  salesperson: "KIRAN",
  routeDate: "2026-09-20",
  startAddress: "Hyderabad office",
  endAddress: "Secunderabad office",
  returnToStart: false,
  workdayStart: "09:00",
  workdayEnd: "18:00",
  dealerIds: [10, 20],
  includeApproximate: false,
};

test("builds a traffic-aware request for the planned departure time", () => {
  const body = buildGoogleRoutesRequest(
    request,
    dealers,
    new Date("2026-09-19T00:00:00.000Z"),
  );
  assert.equal(body.departureTime, "2026-09-20T03:30:00.000Z");
  assert.deepEqual(body.origin, { address: "Hyderabad office" });
  assert.deepEqual(body.destination, { address: "Secunderabad office" });
  assert.deepEqual(body.intermediates[0], { placeId: "place-10" });
  assert.deepEqual(body.intermediates[1], {
    location: { latLng: { latitude: 17.4, longitude: 78.48 } },
  });
  assert.equal(body.optimizeWaypointOrder, true);
  assert.equal(body.routingPreference, "TRAFFIC_AWARE");
});

test("uses precise coordinates from the salesperson's current location", () => {
  assert.deepEqual(routeEndpoint("17.385044, 78.486671"), {
    location: {
      latLng: { latitude: 17.385044, longitude: 78.486671 },
    },
  });
  assert.deepEqual(routeEndpoint("Hyderabad office"), {
    address: "Hyderabad office",
  });
  assert.deepEqual(routeEndpoint("91, 78"), { address: "91, 78" });
});

test("maps Google's optimized indexes and route metrics back to dealers", () => {
  const route = parseGoogleRoute(
    {
      routes: [
        {
          optimizedIntermediateWaypointIndex: [1, 0],
          distanceMeters: 12_500,
          duration: "2700s",
          legs: [
            { distanceMeters: 4_000, duration: "900s" },
            { distanceMeters: 5_000, duration: "1200s" },
            { distanceMeters: 3_500, duration: "600s" },
          ],
          polyline: { encodedPolyline: "encoded" },
        },
      ],
    },
    dealers,
  );

  assert.deepEqual(route.dealerIds, [20, 10]);
  assert.deepEqual(route.legSeconds, [900, 1200, 600]);
  assert.equal(route.totalDistanceMeters, 12_500);
  assert.equal(route.totalDurationSeconds, 2_700);
  assert.equal(route.encodedPolyline, "encoded");
});

test("rejects an incomplete optimized stop order", () => {
  assert.throws(
    () =>
      parseGoogleRoute(
        { routes: [{ optimizedIntermediateWaypointIndex: [0] }] },
        dealers,
      ),
    /invalid stop order/i,
  );
});
