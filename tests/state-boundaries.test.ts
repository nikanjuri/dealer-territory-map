import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { INDIAN_STATES } from "../lib/indian-states.ts";
import {
  createStateBoundaryLoader,
  dealerStateBoundaryCodes,
  highlightedStateBoundaryCodes,
  EMPTY_STATE_BOUNDARIES,
  selectStateBoundaries,
  STATE_BOUNDARY_CODES,
  stateBoundaryFeatureId,
  type StateBoundaryData,
} from "../lib/state-boundaries.ts";

const fixture = (code: string): StateBoundaryData => ({
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { shapeISO: code, displayName: code, coverage: "context" },
    geometry: { type: "Polygon", coordinates: [[[76, 12], [78, 12], [78, 14], [76, 12]]] },
  }],
});
const mockFetch = (fn: (url: string) => Promise<Response> | Response): typeof fetch => async (input) => fn(String(input));

test("state context follows supplied dealers, deduplicates aliases and has no fixed two-state fallback", () => {
  assert.deepEqual(dealerStateBoundaryCodes([
    { state: "AP" }, { state: "Telangana" }, { state: "TS" },
    { state: "Karnataka" }, { state: " Tamil Nadu " }, { state: "Orissa" },
    { state: "Pondicherry" }, { state: "unknown" }, { state: "" },
  ]), ["IN-AP", "IN-KA", "IN-OR", "IN-PY", "IN-TG", "IN-TN"]);
  assert.deepEqual(dealerStateBoundaryCodes([]), []);
  assert.deepEqual(dealerStateBoundaryCodes([{ state: "Karnataka" }]), ["IN-KA"]);
});

const dealersInState = (state: string, count: number) => Array.from({ length: count }, () => ({ state, pincode: "500001" }));

test("state highlights use a strict greater-than-50 dealer threshold per state", () => {
  assert.deepEqual(highlightedStateBoundaryCodes([
    ...dealersInState("Telangana", 51),
    ...dealersInState("Andhra Pradesh", 50),
    ...dealersInState("Karnataka", 49),
  ]), ["IN-TG"]);
  assert.deepEqual(highlightedStateBoundaryCodes(dealersInState("Karnataka", 50)), []);
  assert.deepEqual(highlightedStateBoundaryCodes(dealersInState("Karnataka", 51)), ["IN-KA"]);
});

test("counts dealer markers, not distinct PIN codes, with normalized state aliases", () => {
  const dealers = [...dealersInState("TS", 25), ...dealersInState("Telangana", 26)];
  assert.equal(new Set(dealers.map((dealer) => dealer.pincode)).size, 1);
  assert.deepEqual(highlightedStateBoundaryCodes(dealers), ["IN-TG"]);
  assert.equal(dealers.length, 51);
});

test("explicitly selected states with matching dealers bypass the threshold", () => {
  assert.deepEqual(highlightedStateBoundaryCodes(dealersInState("Haryana", 1), "Haryana"), ["IN-HR"]);
  assert.deepEqual(highlightedStateBoundaryCodes(dealersInState("Karnataka", 50), "KA"), ["IN-KA"]);
  assert.deepEqual(highlightedStateBoundaryCodes(dealersInState("Haryana", 1)), []);
});

test("empty or unrelated scopes never get an invented state highlight", () => {
  assert.deepEqual(highlightedStateBoundaryCodes([], "Haryana"), []);
  assert.deepEqual(highlightedStateBoundaryCodes(dealersInState("Telangana", 1), "Haryana"), []);
  assert.deepEqual(highlightedStateBoundaryCodes(dealersInState("Unknown", 100)), []);
});

test("filtered counts crossing below the threshold clear state context but retain dealer inputs", () => {
  const all = dealersInState("Telangana", 51);
  const filtered = all.slice(0, 50);
  assert.deepEqual(highlightedStateBoundaryCodes(all), ["IN-TG"]);
  const codes = highlightedStateBoundaryCodes(filtered);
  assert.deepEqual(selectStateBoundaries(fixture("IN-TG"), codes), EMPTY_STATE_BOUNDARIES);
  assert.equal(all.length, 51);
  assert.equal(filtered.length, 50);
  assert.deepEqual(highlightedStateBoundaryCodes(filtered, "Telangana"), ["IN-TG"]);
});

test("all 36 canonical states have valid checked-in on-demand outlines with textual names", async () => {
  assert.deepEqual(Object.keys(STATE_BOUNDARY_CODES).sort(), [...INDIAN_STATES].sort());
  assert.equal(new Set(Object.values(STATE_BOUNDARY_CODES)).size, 36);
  for (const state of INDIAN_STATES) {
    const code = STATE_BOUNDARY_CODES[state];
    const data: StateBoundaryData = JSON.parse(await fs.readFile(new URL(`../public/state-boundaries/${code}.geojson`, import.meta.url), "utf8"));
    assert.equal(data.type, "FeatureCollection");
    assert.equal(data.features.length, 1);
    const feature = data.features[0];
    assert.equal(feature.properties.shapeISO, code);
    assert.equal(feature.properties.displayName, state);
    assert.equal(feature.properties.coverage, "context");
    assert.ok(["Polygon", "MultiPolygon"].includes(feature.geometry.type));
    const rings = feature.geometry.type === "Polygon" ? feature.geometry.coordinates as number[][][] : (feature.geometry.coordinates as number[][][][]).flat();
    assert.ok(rings.length > 0);
    for (const ring of rings) {
      assert.ok(ring.length >= 4);
      assert.deepEqual(ring[0], ring.at(-1));
      for (const [longitude, latitude] of ring) {
        assert.ok(Number.isFinite(longitude) && longitude >= -180 && longitude <= 180);
        assert.ok(Number.isFinite(latitude) && latitude >= -90 && latitude <= 90);
      }
    }
  }
});

test("existing AP/Telangana audit geometry is preserved exactly", async () => {
  const original: StateBoundaryData = JSON.parse(await fs.readFile(new URL("../public/region-boundaries.geojson", import.meta.url), "utf8"));
  assert.equal(original.features.length, 2);
  for (const feature of original.features) {
    const single = JSON.parse(await fs.readFile(new URL(`../public/state-boundaries/${feature.properties.shapeISO}.geojson`, import.meta.url), "utf8"));
    assert.deepEqual(single.features[0], feature);
  }
});

test("filter switches remove old highlights immediately and retain stable geometry identity", () => {
  const all: StateBoundaryData = { type: "FeatureCollection", features: [...fixture("IN-TG").features, ...fixture("IN-KA").features] };
  const selected = selectStateBoundaries(all, ["IN-KA"]);
  assert.deepEqual(selected.features.map(stateBoundaryFeatureId), ["state-IN-KA"]);
  assert.equal(selected.features[0], all.features[1]);
  assert.deepEqual(selectStateBoundaries(all, []), EMPTY_STATE_BOUNDARIES);
  assert.deepEqual(selectStateBoundaries(all, ["IN-MH"]), EMPTY_STATE_BOUNDARIES);
  assert.notEqual(stateBoundaryFeatureId(all.features[0]), stateBoundaryFeatureId(all.features[1]));
});

test("loader only fetches requested state assets and reuses successful/in-flight requests", async () => {
  const urls: string[] = [];
  const load = createStateBoundaryLoader(mockFetch((url) => {
    urls.push(url);
    return Response.json(fixture(url.split("/").at(-1)!.replace(".geojson", "")));
  }));
  const [first, second] = await Promise.all([load(["IN-KA", "IN-KA", "IN-TG"]), load(["IN-TG"])]);
  assert.deepEqual(urls.sort(), ["/state-boundaries/IN-KA.geojson", "/state-boundaries/IN-TG.geojson"]);
  assert.equal(first.data.features.length, 2);
  assert.equal(second.data.features.length, 1);
  assert.deepEqual(first.failedCodes, []);
  await load(["IN-KA"]);
  assert.equal(urls.length, 2);
  assert.deepEqual(await load([]), { data: EMPTY_STATE_BOUNDARIES, failedCodes: [] });
  assert.equal(urls.length, 2);
  await assert.rejects(() => load(["../../private"]), /Unknown state/);
  assert.equal(urls.length, 2);
});

test("one failed state does not hide others and retries reuse successful geometry", async () => {
  let attempts = 0;
  const calls: string[] = [];
  const load = createStateBoundaryLoader(mockFetch((url) => {
    calls.push(url);
    if (url.includes("IN-KA") && attempts++ === 0) return new Response(null, { status: 503 });
    return Response.json(fixture(url.includes("IN-KA") ? "IN-KA" : "IN-TG"));
  }));
  const first = await load(["IN-KA", "IN-TG"]);
  assert.deepEqual(first.failedCodes, ["IN-KA"]);
  assert.deepEqual(first.data.features.map(stateBoundaryFeatureId), ["state-IN-TG"]);
  const retry = await load(["IN-KA", "IN-TG"]);
  assert.deepEqual(retry.failedCodes, []);
  assert.equal(retry.data.features.length, 2);
  assert.equal(calls.filter((url) => url.includes("IN-TG")).length, 1);
});

test("loader rejects mismatched, empty and malformed responses rather than showing wrong states", async () => {
  for (const response of [fixture("IN-TG"), EMPTY_STATE_BOUNDARIES, { type: "FeatureCollection", features: [null] }, { type: "FeatureCollection", features: [{ ...fixture("IN-KA").features[0], geometry: null }] }]) {
    const load = createStateBoundaryLoader(mockFetch(() => Response.json(response)));
    const result = await load(["IN-KA"]);
    assert.deepEqual(result, { data: EMPTY_STATE_BOUNDARIES, failedCodes: ["IN-KA"] });
  }
});
