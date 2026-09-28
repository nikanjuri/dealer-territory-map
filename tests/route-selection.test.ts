import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ROUTE_STOPS,
  selectRouteDealerIds,
  toggleRouteDealerId,
} from "../lib/route-selection.ts";

test("route selection caps and deduplicates the initial dealer list", () => {
  const dealerIds = [...Array.from({ length: 30 }, (_, index) => index + 1), 1];
  const selected = selectRouteDealerIds(dealerIds);

  assert.equal(selected.length, MAX_ROUTE_STOPS);
  assert.deepEqual(selected, Array.from({ length: 25 }, (_, index) => index + 1));
});

test("route selection refuses a new stop at the limit but still permits removal", () => {
  const selected = Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => index + 1);

  assert.deepEqual(toggleRouteDealerId(selected, 99), selected);
  assert.deepEqual(toggleRouteDealerId(selected, 10), selected.filter((id) => id !== 10));
});
