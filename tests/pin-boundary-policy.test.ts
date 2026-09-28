import assert from "node:assert/strict";
import test from "node:test";
import type { PinFeature } from "../lib/dealer-geography.ts";
import { normalizePinBoundaryFeature } from "../lib/pin-boundary-policy.ts";

const geometry: PinFeature["geometry"] = { type: "Polygon", coordinates: [
  [[80, 17], [81, 17], [81, 18], [80, 18], [80, 17]],
] };

test("corrects the documented Bhadrachalam legacy state label only", () => {
  const oldLabel: PinFeature = { type: "Feature", geometry,
    properties: { pin_code: "507111", state: "Andhra Pradesh", circle: "Telangana" } };
  const corrected = normalizePinBoundaryFeature(oldLabel);
  assert.equal(corrected.properties.state, "Telangana");
  assert.equal(corrected.properties.original_state, "Andhra Pradesh");
  assert.equal(oldLabel.properties.state, "Andhra Pradesh");

  const unrelated: PinFeature = { ...oldLabel, properties: { ...oldLabel.properties, pin_code: "507112" } };
  assert.equal(normalizePinBoundaryFeature(unrelated).properties.state, "Andhra Pradesh");
});
