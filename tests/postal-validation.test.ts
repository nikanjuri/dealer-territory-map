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
    scope: "India",
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
    "585101": {
      Karnataka: {
        state: "Karnataka",
        districts: ["Kalaburagi"],
        offices: ["Kalaburagi H.O"],
        blocks: [],
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
    "Warrangal",
  );
  assert.equal(result.status, "review");
  assert.equal(result.suggestions[0], "Warangal H.O");
});

test("verifies a curated high-confidence alias against the postal directory", () => {
  const result = validatePostalDetails(
    directory,
    "506002",
    "Telangana",
    "Warngal",
  );
  assert.equal(result.status, "verified");
  assert.equal(result.matchedName, "Warangal H.O");
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

test("verifies Karnataka postal names in the all-India directory", () => {
  const result = validatePostalDetails(
    directory,
    "585101",
    "Karnataka",
    "Kalaburagi",
  );
  assert.equal(result.status, "verified");
});

test("auto-verifies an exact postal district used as the area", () => {
  const districtDirectory: PostalDirectory = {
    ...directory,
    records: {
      ...directory.records,
      "500099": {
        Telangana: {
          state: "Telangana",
          districts: ["Hyderabad"],
          offices: ["Example Colony S.O"],
          blocks: [],
        },
      },
    },
  };
  const result = validatePostalDetails(
    districtDirectory,
    "500099",
    "Telangana",
    "Hyderabad",
  );
  assert.equal(result.status, "verified");
  assert.equal(result.matchedName, "Hyderabad");
});

test("auto-verifies a unique spacing-only postal variation", () => {
  const spacingDirectory: PostalDirectory = {
    ...directory,
    records: {
      ...directory.records,
      "500028": {
        Telangana: {
          state: "Telangana",
          districts: ["Hyderabad"],
          offices: ["Humayunnagar S.O"],
          blocks: [],
        },
      },
    },
  };
  const result = validatePostalDetails(
    spacingDirectory,
    "500028",
    "Telangana",
    "Humayun Nagar",
  );
  assert.equal(result.status, "verified");
  assert.equal(result.matchedName, "Humayunnagar S.O");
});

test("auto-verifies a postal name followed by source qualifiers", () => {
  const result = validatePostalDetails(
    directory,
    "506002",
    "Telangana",
    "Warangal Telangana",
  );
  assert.equal(result.status, "verified");
  assert.equal(result.matchedName, "Warangal H.O");
});

test("keeps moderate and ambiguous spelling matches in review", () => {
  const result = validatePostalDetails(
    directory,
    "585101",
    "Karnataka",
    "Gulbarga",
  );
  assert.equal(result.status, "review");
});
