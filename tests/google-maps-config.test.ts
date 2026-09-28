import assert from "node:assert/strict";
import test from "node:test";

import { resolveGoogleMapsMapId } from "../lib/google-maps-config.ts";

test("uses the configured Google Maps map ID in every environment", () => {
  assert.equal(resolveGoogleMapsMapId("production-map-id", "production"), "production-map-id");
});

test("uses Google's demo map ID only during local development", () => {
  assert.equal(resolveGoogleMapsMapId(undefined, "development"), "DEMO_MAP_ID");
  assert.equal(resolveGoogleMapsMapId(undefined, "production"), undefined);
});
