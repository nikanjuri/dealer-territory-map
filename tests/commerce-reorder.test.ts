import assert from "node:assert/strict";
import test from "node:test";
import { reorderCartItems } from "../lib/commerce-reorder.ts";

test("reorder count and cart additions are available before a deferred state update", () => {
  const variants = new Map([[1, { stockStatus: "in_stock", minimumOrderQuantity: 2 }]]);
  const additions = reorderCartItems([{ variantId: 1, quantity: 2 }], variants);
  assert.equal(Object.keys(additions).length, 1);
  assert.deepEqual({ 7: 4, ...additions }, { 1: 2, 7: 4 });
  assert.deepEqual(reorderCartItems([{ variantId: 1, quantity: 2 }], variants), additions);
});

test("reorder respects current MOQ and excludes missing or unavailable variants", () => {
  const variants = new Map([
    [1, { stockStatus: "in_stock", minimumOrderQuantity: 6 }],
    [2, { stockStatus: "out_of_stock", minimumOrderQuantity: 1 }],
  ]);
  assert.deepEqual(reorderCartItems([
    { variantId: 1, quantity: 2 }, { variantId: 2, quantity: 3 }, { variantId: 99, quantity: 1 },
  ], variants), { 1: 6 });
  assert.deepEqual(reorderCartItems([{ variantId: 2, quantity: 3 }], variants), {});
});
