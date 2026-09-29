import assert from "node:assert/strict";
import test from "node:test";
import { fetchPinBoundaries } from "../lib/pin-boundary-service.ts";

test("loads a missing 2025 PIN polygon from the 2024 layer", async () => {
  const previous = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    const features = url.includes("IN_Postal_Code_Boundaries_2024") ? [{
      type: "Feature", properties: { pin_code: "599998", state: "Telangana", circle_name: "Telangana Circle" },
      geometry: { type: "Polygon", coordinates: [
        [[78, 17], [79, 17], [79, 18], [78, 18], [78, 17]],
      ] },
    }] : [];
    return new Response(JSON.stringify({ type: "FeatureCollection", features }), { status: 200 });
  };
  try {
    const polygons = await fetchPinBoundaries(["599998"]);
    assert.equal(polygons.get("599998")?.length, 1);
    assert.equal(requested.length, 2);
    assert.match(requested[0], /Pincode_Boundary_2025/);
    assert.match(requested[1], /IN_Postal_Code_Boundaries_2024/);
  } finally {
    globalThis.fetch = previous;
  }
});

test("server lookup uses backup during primary failure without inventing geometry", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).includes("IN_Postal_Code_Boundaries_2024")
    ? Response.json({features:[{type:"Feature",properties:{pin_code:"599997",state:"Telangana"},
      geometry:{type:"Polygon",coordinates:[[[78,17],[79,17],[79,18],[78,17]]]}}]})
    : new Response("down", {status:500});
  try { assert.equal((await fetchPinBoundaries(["599997"])).get("599997")?.length,1); }
  finally { globalThis.fetch = previous; }
});

test("server retains successful primary geometry but fails closed for unresolved backup requests", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls++;
    return String(input).includes("IN_Postal_Code_Boundaries_2024") ? new Response("down",{status:500})
      : Response.json({features:[{type:"Feature",properties:{pin_code:"599996",state:"Telangana"},
        geometry:{type:"Polygon",coordinates:[[[78,17],[79,17],[79,18],[78,17]]]}}]});
  };
  try {
    await assert.rejects(fetchPinBoundaries(["599996","599995"]));
    calls = 0;
    assert.equal((await fetchPinBoundaries(["599996"])).get("599996")?.length,1);
    assert.equal(calls,0);
  } finally { globalThis.fetch = previous; }
});
