import assert from "node:assert/strict";
import test from "node:test";

import {
  createRoutePreviewToken,
  readRoutePreviewToken,
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
