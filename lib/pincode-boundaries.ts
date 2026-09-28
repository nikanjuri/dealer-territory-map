import { FALLBACK_PIN_BOUNDARY_QUERY, normalizePinBoundaryFeature, PRIMARY_PIN_BOUNDARY_QUERY } from "./pin-boundary-policy.ts";

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

const BATCH_SIZE = 30;
const CONCURRENCY = 2;
const TIMEOUT_MS = 12_000;
export const BOUNDARY_CACHE_VERSION = "india-pin-2025-plus-2024-v2";
const MAX_CACHED_PINS = 4000;
const pinFeatures = new Map<string, PincodeBoundaryData["features"]>();
const absentPins = new Set<string>();
let initialPromise: Promise<void> | null = null;

function cacheKey(pin: string) { return `${BOUNDARY_CACHE_VERSION}:${pin}`; }

function collection(): PincodeBoundaryData {
  return { type: "FeatureCollection", features: [...pinFeatures.values()].flat() };
}

function remember(pin: string, feature: PincodeBoundaryData["features"][number]) {
  const key = cacheKey(pin);
  const existing = pinFeatures.get(key) ?? [];
  pinFeatures.delete(key);
  pinFeatures.set(key, [...existing, feature]);
  if (pinFeatures.size > MAX_CACHED_PINS) {
    const oldest = pinFeatures.keys().next().value;
    if (oldest) pinFeatures.delete(oldest);
  }
}

export function cachedPincodeBoundaries() {
  return collection();
}

async function requestJson(url: string, signal?: AbortSignal): Promise<PincodeBoundaryData> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("PIN boundaries could not be loaded.");
    return await response.json() as PincodeBoundaryData;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export async function loadInitialPincodeBoundaries() {
  initialPromise ??= requestJson("/pincode-boundaries.geojson").then((data) => {
    for (const feature of data.features) {
      const pin = String(feature.properties.pin_code ?? "");
      if (!/^\d{6}$/.test(pin)) continue;
      remember(pin, feature);
    }
  }).catch((error) => {
    initialPromise = null;
    throw error;
  });
  await initialPromise;
  return collection();
}

export async function loadMissingPincodeBoundaries(
  pincodes: string[],
  onBatch: (data: PincodeBoundaryData) => void,
  signal?: AbortSignal,
) {
  const pending = [...new Set(pincodes)]
    .filter((pin) => /^\d{6}$/.test(pin) && !pinFeatures.has(cacheKey(pin)) && !absentPins.has(pin));
  const batches = Array.from({ length: Math.ceil(pending.length / BATCH_SIZE) }, (_, index) =>
    pending.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE));
  let next = 0;
  let failures = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, async () => {
    while (next < batches.length && !signal?.aborted) {
      const batch = batches[next++];
      const query = new URLSearchParams({
        where: `pin_code IN (${batch.map((pin) => `'${pin}'`).join(",")})`,
        outFields: "pin_code,fname,state,circle,region,division",
        returnGeometry: "true",
        outSR: "4326",
        f: "geojson",
      });
      try {
        const data = await requestJson(`${PRIMARY_PIN_BOUNDARY_QUERY}?${query}`, signal);
        if (signal?.aborted) return;
        const returned = new Set(data.features.map((feature) => String(feature.properties.pin_code ?? "")));
        const missing = batch.filter((pin) => !returned.has(pin));
        let fallback: PincodeBoundaryData = { type: "FeatureCollection", features: [] };
        if (missing.length) {
          const fallbackQuery = new URLSearchParams({
            where: `pin_code IN (${missing.map((pin) => `'${pin}'`).join(",")})`,
            outFields: "pin_code,office_name,state,circle_name",
            returnGeometry: "true", outSR: "4326", f: "geojson",
          });
          fallback = await requestJson(`${FALLBACK_PIN_BOUNDARY_QUERY}?${fallbackQuery}`, signal);
        }
        if (signal?.aborted) return;
        const combined: PincodeBoundaryData = { type: "FeatureCollection",
          features: [...data.features, ...fallback.features].map(normalizePinBoundaryFeature) };
        for (const feature of combined.features) {
          const pin = String(feature.properties.pin_code ?? "");
          if (!batch.includes(pin)) continue;
          returned.add(pin);
          remember(pin, feature);
        }
        for (const pin of batch) if (!returned.has(pin)) absentPins.add(pin);
        onBatch(combined);
      } catch {
        if (!signal?.aborted) failures += 1;
      }
    }
  }));
  return { failedBatches: failures, missingPins: pending.filter((pin) => absentPins.has(pin)).length };
}
