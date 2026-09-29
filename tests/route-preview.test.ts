import assert from "node:assert/strict";
import test from "node:test";

import {
  createRoutePreviewToken,
  readRoutePreviewToken,
  routeDealerFingerprint,
} from "../lib/route-preview.ts";

const now = new Date("2026-09-20T00:00:00.000Z");
const payload = {
  request: {
    salesperson: "KIRAN",
    routeDate: "2026-09-20",
    startAddress: "Hyderabad office",
    returnToStart: true,
    workdayStart: "09:00",
    workdayEnd: "18:00",
    dealerIds: [1, 2],
    includeApproximate: false,
  },
  optimized: {
    dealerIds: [2, 1],
    legMeters: [4_000, 6_000, 5_000],
    legSeconds: [1_200, 1_800, 1_500],
    totalDistanceMeters: 15_000,
    totalDurationSeconds: 4_500,
  },
  provider: "google-routes" as const,
  warning: null,
  encodedPolyline: "encoded-route",
};

test("round-trips a signed route preview", () => {
  const token = createRoutePreviewToken(payload, "test-secret", now);
  const decoded = readRoutePreviewToken(
    token,
    "test-secret",
    new Date("2026-09-20T01:00:00.000Z"),
  );

  assert.equal(decoded.request.salesperson, "KIRAN");
  assert.deepEqual(decoded.optimized.dealerIds, [2, 1]);
  assert.equal(decoded.encodedPolyline, "encoded-route");
});

test("rejects a route preview that was changed in the browser", () => {
  const token = createRoutePreviewToken(payload, "test-secret", now);
  const [value, signature] = token.split(".");
  assert.throws(
    () => readRoutePreviewToken(`${value}x.${signature}`, "test-secret", now),
    /invalid/i,
  );
});

test("rejects an expired route preview", () => {
  const token = createRoutePreviewToken(payload, "test-secret", now);
  assert.throws(
    () =>
      readRoutePreviewToken(
        token,
        "test-secret",
        new Date("2026-09-20T02:00:00.001Z"),
      ),
    /expired/i,
  );
});

test("dealer fingerprints ignore query order but detect changed routing inputs", () => {
  const first = { id: 1, latitude: 17.4, longitude: 78.4, serviceMinutes: 30 };
  const second = { ...first, id: 2 };
  const fingerprint = routeDealerFingerprint([first, second]);
  assert.equal(fingerprint, routeDealerFingerprint([second, first]));
  for (const change of [{ latitude: 17.5 }, { longitude: 78.5 }, { serviceMinutes: 60 }, { address: "New address" }, { googlePlaceId: "new-place" }, { locationPrecision: "address" }]) {
    assert.notEqual(fingerprint, routeDealerFingerprint([{ ...first, ...change }, second]));
  }
});

test("signed previews preserve the routing input fingerprint", () => {
  const token = createRoutePreviewToken({ ...payload, dealerFingerprint: "snapshot" }, "test-secret", now);
  assert.equal(readRoutePreviewToken(token, "test-secret", now).dealerFingerprint, "snapshot");
});
