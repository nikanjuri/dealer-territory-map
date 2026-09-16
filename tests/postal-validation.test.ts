import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePostalName,
  validatePostalDetails,
  type PostalDirectory,
} from "../lib/postal-validation.ts";

const directory: PostalDirectory = {
  meta: {
    generatedAt: "2026-09-14T00:00:00.000Z",
    retrievedAt: "2026-09-14",
    sourceAuthority: "Department of Posts",
    sourceCatalog: "https://example.com/catalog",
    deliveryMirror: "https://example.com/mirror.csv",
    license: "Government Open Data License - India",
    sourceSha256: "test",
  },
  records: {
    "500001": {
      Telangana: {
        state: "Telangana",
        districts: ["Hyderabad"],
        offices: ["Hyderabad H.O", "Gandhi Bhawan (Hyderabad) S.O"],
        blocks: ["Nampally"],
      },
    },
    "506002": {
      Telangana: {
        state: "Telangana",
        districts: ["Warangal"],
        offices: ["Warangal H.O"],
        blocks: ["Warangal"],
      },
    },
  },
};

test("normalizes postal office suffixes and punctuation", () => {
  assert.equal(normalizePostalName("Gandhi Bhawan S.O."), "GANDHI BHAWAN");
});

test("verifies an exact office or block match", () => {
  assert.equal(
    validatePostalDetails(directory, "500001", "Telangana", "Nampally")
      .status,
    "verified",
  );
});

test("sends a likely spelling variation to review", () => {
  const result = validatePostalDetails(
    directory,
    "506002",
    "Telangana",
    "Warngal",
  );
  assert.equal(result.status, "review");
  assert.equal(result.suggestions[0], "Warangal H.O");
});

test("rejects a PIN from the wrong state", () => {
  const result = validatePostalDetails(
    directory,
    "500001",
    "Andhra Pradesh",
    "Hyderabad",
  );
  assert.equal(result.status, "invalid");
  assert.match(result.message, /listed under Telangana/);
});

test("rejects a PIN absent from the scoped directory", () => {
  const result = validatePostalDetails(
    directory,
    "999999",
    "Telangana",
    "Unknown",
  );
  assert.equal(result.status, "invalid");
});
