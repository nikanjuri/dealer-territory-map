import assert from "node:assert/strict";
import test from "node:test";
import {
  canDeleteCommerceAccount,
  commerceCategoryInputSchema,
  commerceProductInputSchema,
  createCommerceAccountSchema,
  deleteCommerceAccountSchema,
  placeCommerceOrderSchema,
  resetCommercePasswordSchema,
  setCommerceAccountActiveSchema,
} from "../lib/commerce-contract.ts";

test("accepts validated product prices in integer paise", () => {
  assert.equal(
    commerceProductInputSchema.safeParse({
      name: "Cotton collection",
      active: true,
      variants: [
        {
          color: "Indigo",
          sku: "COT-IND-01",
          pricePaise: 129_900,
          minimumOrderQuantity: 6,
          stockStatus: "in_stock",
        },
      ],
    }).success,
    true,
  );
});

test("commerce account password replacement requires a strong password", () => {
  assert.equal(
    resetCommercePasswordSchema.safeParse({ authUserId: "user-1", password: "short" })
      .success,
    false,
  );
  assert.equal(
    resetCommercePasswordSchema.safeParse({
      authUserId: "user-1",
      password: "replacement-password",
    }).success,
    true,
  );
});

test("checkout accepts variant and quantity only, never client prices", () => {
  const parsed = placeCommerceOrderSchema.safeParse({
    requestKey: "123e4567-e89b-42d3-a456-426614174000",
    items: [{ variantId: 12, quantity: 6 }],
    totalPaise: 1,
  });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal("totalPaise" in parsed.data, false);
});

test("retailer accounts require a dealer while operations accounts do not", () => {
  const base = {
    username: "shop-one",
    password: "temporary-password",
    displayName: "Shop One",
  };
  assert.equal(
    createCommerceAccountSchema.safeParse({ ...base, role: "retailer" }).success,
    false,
  );
  assert.equal(
    createCommerceAccountSchema.safeParse({
      ...base,
      role: "retailer",
      dealerId: 3,
    }).success,
    true,
  );
  assert.equal(
    createCommerceAccountSchema.safeParse({ ...base, role: "operations_staff" }).success,
    true,
  );
});

test("product migration contract preserves category ids and multiple images", () => {
  const parsed = commerceProductInputSchema.safeParse({
    name: "Linen checks",
    fabricTypeId: 2,
    designId: 7,
    imageUrls: [
      "https://assets.example.com/front.jpg",
      "https://assets.example.com/detail.jpg",
    ],
    active: true,
    variants: [
      {
        color: "Natural",
        sku: "LIN-NAT-01",
        pricePaise: 75_000,
        minimumOrderQuantity: 12,
        stockStatus: "low_stock",
      },
    ],
  });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.imageUrls.length, 2);
});

test("commerce categories and account activation are validated", () => {
  assert.equal(
    commerceCategoryInputSchema.safeParse({
      name: "Cotton",
      type: "fabric_type",
      active: true,
    }).success,
    true,
  );
  assert.equal(
    setCommerceAccountActiveSchema.safeParse({
      authUserId: "user-1",
      active: false,
    }).success,
    true,
  );
});

test("commerce-only accounts can be deleted but team identities stay protected", () => {
  assert.equal(
    deleteCommerceAccountSchema.safeParse({ authUserId: "user-1" }).success,
    true,
  );
  assert.equal(
    canDeleteCommerceAccount({ roles: ["retailer"], salespersonId: null }),
    true,
  );
  assert.equal(
    canDeleteCommerceAccount({
      roles: ["operations_staff"],
      salespersonId: null,
    }),
    true,
  );
  assert.equal(
    canDeleteCommerceAccount({
      roles: ["salesperson", "operations_staff"],
      salespersonId: 3,
    }),
    false,
  );
  assert.equal(
    canDeleteCommerceAccount({ roles: ["admin"], salespersonId: null }),
    false,
  );
});
