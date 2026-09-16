import assert from "node:assert/strict";
import test from "node:test";
import {
  haversineMeters,
  optimizeRoutePreview,
  type RoutePoint,
} from "../lib/route-optimizer.ts";

const points: RoutePoint[] = [
  { dealerId: 1, latitude: 17.385, longitude: 78.4867 },
  { dealerId: 2, latitude: 17.4483, longitude: 78.3915 },
  { dealerId: 3, latitude: 17.4065, longitude: 78.4772 },
  { dealerId: 4, latitude: 17.2403, longitude: 78.4294 },
];

test("calculates a plausible great-circle distance", () => {
  const distance = haversineMeters(points[0], points[2]);
  assert.ok(distance > 2_000);
  assert.ok(distance < 3_000);
});
test("returns every dealer exactly once with route metrics", () => {
  const route = optimizeRoutePreview(points);
  assert.deepEqual([...route.dealerIds].sort(), [1, 2, 3, 4]);
  assert.equal(new Set(route.dealerIds).size, 4);
  assert.equal(route.legMeters.length, 5);
  assert.equal(route.legSeconds.length, 5);
  assert.ok(route.totalDistanceMeters > 0);
  assert.ok(route.totalDurationSeconds > 0);
});
