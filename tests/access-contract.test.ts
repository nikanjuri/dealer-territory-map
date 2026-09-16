import assert from "node:assert/strict";
import test from "node:test";

import {
  assignDealersSchema,
  authEmailForUsername,
  canOperateOwnRoutes,
  createSalespersonSchema,
  normalizeSalespersonName,
  normalizeUsername,
  salespersonCredentialsSchema,
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
      salespersonId: 7,
      salesperson: "KIRAN",
    }),
    true,
  );
  assert.equal(
    canOperateOwnRoutes({
      ...baseSession,
      role: "admin",
      salespersonId: null,
      salesperson: null,
    }),
    false,
  );
});
