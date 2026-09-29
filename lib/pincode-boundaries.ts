import { FALLBACK_PIN_BOUNDARY_QUERY, normalizePinBoundaryFeature, PRIMARY_PIN_BOUNDARY_QUERY } from "./pin-boundary-policy.ts";
import { validPinBoundary } from "./pin-boundary-geometry.ts";
import { readPersistentPinBoundaries, writePersistentPinBoundaries } from "./pin-boundary-cache.ts";
export { BOUNDARY_CACHE_VERSION } from "./pin-boundary-cache.ts";

export type PincodeBoundaryData = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, string | number | boolean | null>;
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: number[][][] | number[][][][];
    };
  }>;
};
type Feature = PincodeBoundaryData["features"][number];
type Cache = { read: () => Promise<Feature[]>; write: (features: Feature[]) => Promise<unknown> };
const BATCH_SIZE = 30;
const CONCURRENCY = 2;
const TIMEOUT_MS = 12_000;
const MAX_CACHED_PINS = 4000;

export function createPincodeBoundaryLoader(options: { fetcher?: typeof fetch; cache?: Cache; timeoutMs?: number } = {}) {
  const fetcher = options.fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const cache = options.cache ?? { read: readPersistentPinBoundaries, write: writePersistentPinBoundaries };
  const pinFeatures = new Map<string, Feature[]>();
  let initialPromise: Promise<void> | null = null;
  let restorePromise: Promise<void> | null = null;
  const collection = (): PincodeBoundaryData => ({ type: "FeatureCollection", features: [...pinFeatures.values()].flat() });

  function remember(features: Feature[]) {
    const grouped = new Map<string, Feature[]>();
    for (const feature of features) {
      if (!validPinBoundary(feature)) continue;
      const pin = String(feature.properties.pin_code);
      const matches = grouped.get(pin) ?? [];
      matches.push(normalizePinBoundaryFeature(feature));
      grouped.set(pin, matches);
    }
    for (const [pin, matches] of grouped) {
      pinFeatures.delete(pin);
      pinFeatures.set(pin, matches);
    }
    while (pinFeatures.size > MAX_CACHED_PINS) pinFeatures.delete(pinFeatures.keys().next().value!);
  }

  async function restore() {
    restorePromise ??= cache.read().then(remember).catch(() => {});
    await restorePromise;
  }

  async function requestJson(url: string, signal?: AbortSignal): Promise<PincodeBoundaryData> {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetcher(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`PIN boundary service failed (${response.status}).`);
      const data = await response.json();
      if (data?.error || data?.type !== "FeatureCollection" || !Array.isArray(data.features) ||
          !data.features.every(validPinBoundary)) throw new Error("Invalid PIN boundary response.");
      return data as PincodeBoundaryData;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  async function loadInitialPincodeBoundaries() {
    await restore();
    initialPromise ??= requestJson("/pincode-boundaries.geojson").then((data) => {
      // Restored geometry takes precedence; the local extract is just a seed.
      remember(data.features.filter((feature) => !pinFeatures.has(String(feature.properties.pin_code))));
    }).catch((error) => { initialPromise = null; throw error; });
    try { await initialPromise; } catch {
      // A seed failure must not prevent cached geometry or on-demand lookups.
    }
    return collection();
  }

  async function loadMissingPincodeBoundaries(pincodes: string[],
    onBatch: (data: PincodeBoundaryData) => void, signal?: AbortSignal) {
    await restore();
    const unique = [...new Set(pincodes)].filter((pin) => /^\d{6}$/.test(pin));
    const pending = unique.filter((pin) => !pinFeatures.has(pin));
    const batches = Array.from({ length: Math.ceil(pending.length / BATCH_SIZE) }, (_, index) =>
      pending.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE));
    let next = 0;
    let failures = 0;
    const missing = new Set<string>();
    const failed = new Set<string>();

    async function lookup(endpoint: string, pins: string[], outFields: string) {
      const query = new URLSearchParams({ where: `pin_code IN (${pins.map((pin) => `'${pin}'`).join(",")})`,
        outFields, returnGeometry: "true", outSR: "4326", f: "geojson" });
      const data = await requestJson(`${endpoint}?${query}`, signal);
      if (signal?.aborted) return;
      const accepted = data.features.filter((feature) => pins.includes(String(feature.properties.pin_code)))
        .map(normalizePinBoundaryFeature);
      if (accepted.length) {
        remember(accepted);
        onBatch({ type: "FeatureCollection", features: accepted });
        await cache.write(accepted).catch(() => {});
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, async () => {
      while (next < batches.length && !signal?.aborted) {
        const batch = batches[next++];
        let primaryFailed = false;
        let fallbackFailed = false;
        try { await lookup(PRIMARY_PIN_BOUNDARY_QUERY, batch, "pin_code,fname,state,circle,region,division"); }
        catch { primaryFailed = true; }
        if (signal?.aborted) return;
        // Publish and persist primary results before attempting the backup.
        const remaining = batch.filter((pin) => !pinFeatures.has(pin));
        if (remaining.length) {
          try { await lookup(FALLBACK_PIN_BOUNDARY_QUERY, remaining, "pin_code,office_name,state,circle_name"); }
          catch { fallbackFailed = true; }
        }
        if (signal?.aborted) return;
        const unresolved = batch.filter((pin) => !pinFeatures.has(pin));
        if (unresolved.length && (primaryFailed || fallbackFailed)) {
          failures += 1;
          for (const pin of unresolved) failed.add(pin);
        } else for (const pin of unresolved) missing.add(pin);
      }
    }));
    return { failedBatches: failures, failedPins: failed.size, missingPins: missing.size,
      unavailablePins: unique.filter((pin) => !pinFeatures.has(pin)).length, totalPins: unique.length };
  }

  return { cachedPincodeBoundaries: collection, loadInitialPincodeBoundaries, loadMissingPincodeBoundaries };
}

export const { cachedPincodeBoundaries, loadInitialPincodeBoundaries, loadMissingPincodeBoundaries } = createPincodeBoundaryLoader();
