import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { dealers } from "../db/schema.ts";

test("dealer identity is unique across salespeople", () => {
  const identityIndex = getTableConfig(dealers).indexes.find(
    (index) => index.config.name === "dealers_identity_unique",
  );

  assert.ok(identityIndex);
  assert.equal(identityIndex.config.unique, true);
  assert.deepEqual(
    identityIndex.config.columns.map((column) =>
      "name" in column ? column.name : undefined,
    ),
    ["name", "pincode"],
  );
});
