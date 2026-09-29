import assert from "node:assert/strict";
import test from "node:test";
import { createPincodeBoundaryLoader, type PincodeBoundaryData } from "../lib/pincode-boundaries.ts";
import { validPinBoundary } from "../lib/pin-boundary-geometry.ts";

const polygon = (pin: string): PincodeBoundaryData["features"][number] => ({
  type: "Feature", properties: { pin_code: pin, state: "Telangana" },
  geometry: { type: "Polygon", coordinates: [[[78,17],[79,17],[79,18],[78,17]]] },
});
const response = (pins: string[]) => Response.json({ type: "FeatureCollection", features: pins.map(polygon) });
const noCache = { read: async () => [], write: async () => {} };
const isBackup = (url: string) => url.includes("IN_Postal_Code_Boundaries_2024");

test("publishes and persists primary polygons before the backup fails", async () => {
  const events: string[] = [];
  const loader = createPincodeBoundaryLoader({ cache: {
    read: async () => [], write: async (features) => { events.push(`saved:${features[0].properties.pin_code}`); },
  }, fetcher: async (input) => {
    if (isBackup(String(input))) { events.push("backup"); return new Response("down", { status: 500 }); }
    return response(["500010"]);
  } });
  const result = await loader.loadMissingPincodeBoundaries(["500010", "500011"], (data) => {
    events.push(`rendered:${data.features[0].properties.pin_code}`);
  });
  assert.deepEqual(events, ["rendered:500010", "saved:500010", "backup"]);
  assert.equal(loader.cachedPincodeBoundaries().features.length, 1);
  assert.equal(result.failedPins, 1);
  assert.equal(result.unavailablePins, 1);
});

test("primary HTTP failure still attempts the backup and clears the error if it fills the batch", async () => {
  const loader = createPincodeBoundaryLoader({ cache: noCache, fetcher: async (input) =>
    isBackup(String(input)) ? response(["500010"]) : new Response("down", { status: 500 }) });
  const result = await loader.loadMissingPincodeBoundaries(["500010"], () => {});
  assert.equal(result.failedBatches, 0);
  assert.equal(result.unavailablePins, 0);
});

test("retry queries only unresolved PINs and does not duplicate cached geometry", async () => {
  let recovering = false;
  const queries: string[] = [];
  const loader = createPincodeBoundaryLoader({ cache: noCache, fetcher: async (input) => {
    const url = String(input);
    queries.push(new URL(url).searchParams.get("where")!);
    if (recovering) return response(["500011"]);
    return isBackup(url) ? new Response("down", { status: 500 }) : response(["500010"]);
  } });
  await loader.loadMissingPincodeBoundaries(["500010", "500011"], () => {});
  recovering = true;
  queries.length = 0;
  const result = await loader.loadMissingPincodeBoundaries(["500010", "500011"], () => {});
  assert.deepEqual(queries, ["pin_code IN ('500011')"]);
  assert.equal(result.unavailablePins, 0);
  assert.equal(loader.cachedPincodeBoundaries().features.length, 2);
});

test("new loader restores public geometry across reload and makes no upstream call for it", async () => {
  const saved = new Map<string, PincodeBoundaryData["features"]>();
  const cache = { read: async () => [...saved.values()].flat(), write: async (features: PincodeBoundaryData["features"]) => {
    for (const feature of features) saved.set(String(feature.properties.pin_code), [feature]);
  } };
  const first = createPincodeBoundaryLoader({ cache, fetcher: async () => response(["500010"]) });
  await first.loadMissingPincodeBoundaries(["500010"], () => {});
  let calls = 0;
  const reloaded = createPincodeBoundaryLoader({ cache, fetcher: async () => { calls++; throw new Error("offline"); } });
  const initial = await reloaded.loadInitialPincodeBoundaries();
  assert.equal(initial.features.length, 1);
  calls = 0;
  assert.equal((await reloaded.loadMissingPincodeBoundaries(["500010"], () => {})).unavailablePins, 0);
  assert.equal(calls, 0);
});

test("HTML and HTTP-200 ArcGIS errors are not cached as geometry", async () => {
  for (const bad of [() => new Response("<html>error</html>"), () => Response.json({ error: { code:500 } })]) {
    const loader = createPincodeBoundaryLoader({ cache: noCache, fetcher: async () => bad() });
    const result = await loader.loadMissingPincodeBoundaries(["500010"], () => {});
    assert.equal(result.unavailablePins, 1);
    assert.equal(result.failedBatches, 1);
    assert.deepEqual(loader.cachedPincodeBoundaries().features, []);
  }
});

test("a missing seed file does not block on-demand lookup", async () => {
  const loader = createPincodeBoundaryLoader({ cache: noCache, fetcher: async (input) =>
    String(input).startsWith("/") ? new Response("missing", { status:404 }) : response(["500010"]) });
  await loader.loadInitialPincodeBoundaries();
  assert.equal((await loader.loadMissingPincodeBoundaries(["500010"], () => {})).unavailablePins, 0);
});

test("storage refusal cannot discard successful network results", async () => {
  const loader = createPincodeBoundaryLoader({ cache: {
    read: async () => { throw new Error("blocked"); }, write: async () => { throw new Error("quota"); },
  }, fetcher: async () => response(["500010"]) });
  assert.equal((await loader.loadMissingPincodeBoundaries(["500010"], () => {})).unavailablePins, 0);
  assert.equal(loader.cachedPincodeBoundaries().features.length, 1);
});

test("valid no-result responses report missing data but can be retried later", async () => {
  let pins: string[] = [];
  const loader = createPincodeBoundaryLoader({ cache: noCache, fetcher: async () => response(pins) });
  const first = await loader.loadMissingPincodeBoundaries(["500010"], () => {});
  assert.equal(first.failedBatches, 0);
  assert.equal(first.missingPins, 1);
  assert.equal(first.unavailablePins, 1);
  pins = ["500010"];
  assert.equal((await loader.loadMissingPincodeBoundaries(pins, () => {})).unavailablePins, 0);
});

test("cancellation makes no requests or callbacks and does not poison retry", async () => {
  let calls = 0;
  const loader = createPincodeBoundaryLoader({ cache: noCache, fetcher: async () => { calls++; return response(["500010"]); } });
  const controller = new AbortController();
  controller.abort();
  await loader.loadMissingPincodeBoundaries(["500010"], () => assert.fail("cancelled callback"), controller.signal);
  assert.equal(calls, 0);
  assert.equal((await loader.loadMissingPincodeBoundaries(["500010"], () => {})).unavailablePins, 0);
});

test("timeouts attempt backup, and aborting a running request preserves already-published results", async () => {
  let calls = 0;
  const loader = createPincodeBoundaryLoader({ cache: noCache, timeoutMs: 5, fetcher: async (_input, init) => {
    calls++;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once:true });
    });
  } });
  const result = await loader.loadMissingPincodeBoundaries(["500010"], () => {});
  assert.equal(calls, 2);
  assert.equal(result.failedPins, 1);
  const controller = new AbortController();
  const partial = createPincodeBoundaryLoader({ cache: noCache, fetcher: async () => response(["500010"]) });
  await partial.loadMissingPincodeBoundaries(["500010", "500011"], () => controller.abort(), controller.signal);
  assert.equal(partial.cachedPincodeBoundaries().features.length, 1);
});

test("same-PIN pieces are preserved and unrequested geometry is excluded", async () => {
  const loader = createPincodeBoundaryLoader({ cache: noCache, fetcher: async () => Response.json({
    type:"FeatureCollection", features:[polygon("500010"), polygon("500010"), polygon("500012")],
  }) });
  await loader.loadMissingPincodeBoundaries(["bad", "500010", "500010"], () => {});
  assert.equal(loader.cachedPincodeBoundaries().features.length, 2);
});

test("only closed, finite WGS84 Polygon/MultiPolygon geometry is accepted", () => {
  assert.equal(validPinBoundary(polygon("500010")), true);
  const invalid = polygon("500010");
  invalid.geometry.coordinates = [[[78,17],[79,17],[79,18],[80,17]]];
  assert.equal(validPinBoundary(invalid), false);
  invalid.geometry.coordinates = [[[NaN,17],[79,17],[79,18],[NaN,17]]];
  assert.equal(validPinBoundary(invalid), false);
  invalid.geometry.coordinates = [[[181,17],[79,17],[79,18],[181,17]]];
  assert.equal(validPinBoundary(invalid), false);
  assert.equal(validPinBoundary({ ...polygon("500010"), geometry:{type:"Point",coordinates:[78,17]} }), false);
  assert.equal(validPinBoundary({ ...polygon("500010"), geometry:{type:"MultiPolygon",coordinates:[polygon("500010").geometry.coordinates]} }), true);
});
