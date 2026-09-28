import assert from "node:assert/strict";
import test from "node:test";

import {
  assignDealersSchema,
  authEmailForUsername,
  canDeleteTeamLogin,
  canManageCommerce,
  canOperateOwnRoutes,
  canUseRetailShop,
  createSalespersonSchema,
  landingPathForSession,
  normalizeSalespersonName,
  normalizeUsername,
  salespersonCredentialsSchema,
  type AppSession,
} from "../lib/access-contract.ts";

test("normalizes usernames without exposing email login", () => {
  assert.equal(normalizeUsername("  Amit.L  "), "amit.l");
  assert.equal(authEmailForUsername("Amit.L"), "amit.l@dealer-territory.invalid");
});

test("normalizes salesperson names for stable dealer assignments", () => {
  assert.equal(normalizeSalespersonName("  Kiran   Kumar "), "KIRAN KUMAR");
});

test("accepts safe usernames and rejects short passwords", () => {
  assert.equal(
    createSalespersonSchema.safeParse({
      username: "kiran_1",
      password: "temporary-password",
      displayName: "Kiran Kumar",
    }).success,
    true,
  );
  assert.equal(
    createSalespersonSchema.safeParse({
      username: "not valid",
      password: "short",
      displayName: "Kiran Kumar",
    }).success,
    false,
  );
});

test("requires one or more valid dealer ids for team assignment", () => {
  assert.equal(assignDealersSchema.safeParse({ dealerIds: [1, 4, 9] }).success, true);
  assert.equal(assignDealersSchema.safeParse({ dealerIds: [] }).success, false);
  assert.equal(assignDealersSchema.safeParse({ dealerIds: [0] }).success, false);
});

test("accepts initial credentials and password-only resets", () => {
  assert.equal(
    salespersonCredentialsSchema.safeParse({
      username: "madhu",
      password: "initial-password",
    }).success,
    true,
  );
  assert.equal(
    salespersonCredentialsSchema.safeParse({
      password: "replacement-password",
    }).success,
    true,
  );
  assert.equal(
    salespersonCredentialsSchema.safeParse({ password: "short" }).success,
    false,
  );
});

test("only a linked salesperson can operate routes", () => {
  const baseSession = {
    userId: "user-1",
    username: "kiran",
    displayName: "Kiran",
  };
  assert.equal(
    canOperateOwnRoutes({
      ...baseSession,
      role: "salesperson",
      roles: ["salesperson", "operations_staff"],
      salespersonId: 7,
      salesperson: "KIRAN",
      dealerId: null,
      dealer: null,
    }),
    true,
  );
  assert.equal(
    canOperateOwnRoutes({
      ...baseSession,
      role: "admin",
      roles: ["admin"],
      salespersonId: null,
      salesperson: null,
      dealerId: null,
      dealer: null,
    }),
    false,
  );
});

test("supports one account with salesperson and operations access", () => {
  const session: AppSession = {
    userId: "user-1",
    username: "kiran",
    displayName: "Kiran",
    role: "salesperson",
    roles: ["salesperson", "operations_staff"],
    salespersonId: 7,
    salesperson: "KIRAN",
    dealerId: null,
    dealer: null,
  };
  assert.equal(canOperateOwnRoutes(session), true);
  assert.equal(canManageCommerce(session), true);
  assert.equal(canUseRetailShop(session), false);
  assert.equal(landingPathForSession(session), "/");
});

test("lands non-field roles inside the unified workspace", () => {
  const base = {
    userId: "user-2",
    username: "operations",
    displayName: "Operations",
    salespersonId: null,
    salesperson: null,
    dealerId: null,
    dealer: null,
  };
  assert.equal(
    landingPathForSession({
      ...base,
      role: "operations_staff",
      roles: ["operations_staff"],
    }),
    "/?workspace=commerce",
  );
  assert.equal(
    landingPathForSession({
      ...base,
      role: "retailer",
      roles: ["retailer"],
      dealerId: 4,
      dealer: "Amit Textiles",
    }),
    "/?workspace=shop",
  );
});

test("team login deletion protects the acting administrator and other admins", () => {
  assert.equal(
    canDeleteTeamLogin({
      actingUserId: "admin-1",
      targetUserId: "salesperson-1",
      targetRoles: ["salesperson", "operations_staff"],
    }),
    true,
  );
  assert.equal(
    canDeleteTeamLogin({
      actingUserId: "admin-1",
      targetUserId: "admin-1",
      targetRoles: ["admin"],
    }),
    false,
  );
  assert.equal(
    canDeleteTeamLogin({
      actingUserId: "admin-1",
      targetUserId: "admin-2",
      targetRoles: ["admin"],
    }),
    false,
  );
});
