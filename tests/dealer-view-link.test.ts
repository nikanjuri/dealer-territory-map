import assert from "node:assert/strict";
import test from "node:test";
import { readDealerViewUrl, writeDealerViewUrl } from "../lib/dealer-view-link.ts";

test("dealer view links round-trip scoped filters without exposing dealer data", () => {
  const url = writeDealerViewUrl(
    new URL("https://example.test/?workspace=team"),
    "dealers",
    {
      query: "market road",
      salespeople: ["KIRAN"],
      state: "Telangana",
      quality: "review",
      pincode: "500001",
      area: "Abids",
    },
    ["KIRAN", "MADHU"],
  );
  assert.equal(url.searchParams.get("workspace"), "dealers");
  assert.equal(url.searchParams.get("person"), "KIRAN");
  assert.deepEqual(readDealerViewUrl(url, ["KIRAN", "MADHU"], ["500001"], ["Abids"]), {
    query: "market road",
    salespeople: ["KIRAN"],
    state: "Telangana",
    quality: "review",
    pincode: "500001",
    area: "Abids",
  });
});

test("dealer view links preserve an intentionally empty salesperson selection", () => {
  const url = writeDealerViewUrl(
    new URL("https://example.test/"),
    "map",
    { query: "", salespeople: [], state: "all", quality: "verified", pincode: "all", area: "all" },
    ["KIRAN"],
  );
  assert.equal(url.searchParams.get("peopleNone"), "1");
  assert.equal(url.searchParams.has("quality"), false);
  assert.deepEqual(readDealerViewUrl(url, ["KIRAN"], [], [])?.salespeople, []);
});
