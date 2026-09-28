import assert from "node:assert/strict";
import test from "node:test";
import { pointInPinFeature, pointInsidePinFeature, type PinFeature } from "../lib/dealer-geography.ts";

test("PIN validation excludes holes and chooses a point inside the polygon", () => {
  const feature: PinFeature = {
    type: "Feature",
    properties: { pin_code: "500089", state: "Telangana" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
      ],
    },
  };
  assert.equal(pointInPinFeature([1, 1], feature), true);
  assert.equal(pointInPinFeature([5, 5], feature), false);
  assert.equal(pointInPinFeature([20, 5], feature), false);
  const chosen = pointInsidePinFeature(feature);
  assert.ok(chosen);
  assert.equal(pointInPinFeature(chosen, feature), true);
});

test("separated PIN parts keep a valid interior point", () => {
  const feature: PinFeature = {
    type: "Feature", properties: { pin_code: "585417", state: "Karnataka" },
    geometry: { type: "MultiPolygon", coordinates: [
      [[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]],
      [[[10, 10], [13, 10], [13, 13], [10, 13], [10, 10]]],
    ] },
  };
  assert.equal(pointInPinFeature([1.5, 1.5], feature), true);
  assert.equal(pointInPinFeature([11, 11], feature), true);
  assert.equal(pointInPinFeature([5, 5], feature), false);
  const chosen = pointInsidePinFeature(feature);
  assert.ok(chosen);
  assert.equal(pointInPinFeature(chosen, feature), true);
});
