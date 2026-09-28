import assert from "node:assert/strict";
import test from "node:test";

import { getReadableTextColor } from "../app/dealers.ts";

test("chooses dark text for light salesperson colors", () => {
  assert.equal(getReadableTextColor("#c48a12"), "#111827");
});

test("chooses white text for dark salesperson colors", () => {
  assert.equal(getReadableTextColor("#252a44"), "#ffffff");
});

test("falls back safely for invalid colors", () => {
  assert.equal(getReadableTextColor("not-a-color"), "#ffffff");
});
