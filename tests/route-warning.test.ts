import assert from "node:assert/strict";
import test from "node:test";
import {
  routeFallbackWarning,
  routeWarningForDisplay,
} from "../lib/route-warning.ts";

const legacyWarning =
  "3 stops use an approximate PIN-code location. Road-aware optimization was unavailable (GOOGLE_ROUTES_API_KEY is not configured.). This draft uses a distance estimate and must be re-optimized before field use.";
const legacyMissingKeyWarning =
  "Road-aware optimization was unavailable (GOOGLE_ROUTES_API_KEY is not configured.). This draft uses a distance estimate and must be re-optimized before field use.";

test("keeps provider configuration details out of new route warnings", () => {
  const warning = routeFallbackWarning(
    "3 stops use an approximate PIN-code location.",
  );

  assert.doesNotMatch(warning, /GOOGLE_ROUTES_API_KEY/);
  assert.match(warning, /temporarily unavailable/);
});

test("removes an obsolete key warning when road optimization is ready", () => {
  const warning = routeWarningForDisplay(legacyWarning, true);

  assert.doesNotMatch(warning ?? "", /GOOGLE_ROUTES_API_KEY/);
  assert.equal(warning, "3 stops use an approximate PIN-code location.");
});

test("hides a legacy-only key warning when road optimization is ready", () => {
  assert.equal(routeWarningForDisplay(legacyMissingKeyWarning, true), null);
});
