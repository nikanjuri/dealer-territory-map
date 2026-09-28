import type { PinFeature } from "./dealer-geography.ts";
import { FALLBACK_PIN_BOUNDARY_QUERY, normalizePinBoundaryFeature, PRIMARY_PIN_BOUNDARY_QUERY } from "./pin-boundary-policy.ts";

const cache = new Map<string, PinFeature[]>();

async function lookup(endpoint: string, batch: string[], outFields: string): Promise<PinFeature[]> {
  if (!batch.length) return [];
  const params = new URLSearchParams({
    where: `pin_code IN (${batch.map((pin) => `'${pin}'`).join(",")})`,
    outFields, returnGeometry: "true", outSR: "4326", f: "geojson",
  });
  const response = await fetch(`${endpoint}?${params}`, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`PIN boundary lookup failed (${response.status}).`);
  const data = await response.json() as { features?: PinFeature[]; error?: unknown };
  if (data.error || !Array.isArray(data.features)) throw new Error("PIN boundary lookup returned invalid data.");
  return data.features.filter((feature) =>
    batch.includes(String(feature.properties?.pin_code ?? "")) &&
    ["Polygon", "MultiPolygon"].includes(feature.geometry?.type));
}

export async function fetchPinBoundaries(pins: string[]): Promise<Map<string, PinFeature[]>> {
  const unique = [...new Set(pins)].filter((pin) => /^\d{6}$/.test(pin));
  const missing = unique.filter((pin) => !cache.has(pin));
  const batches = Array.from({ length: Math.ceil(missing.length / 25) }, (_, index) =>
    missing.slice(index * 25, (index + 1) * 25));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(2, batches.length) }, async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      const primary = await lookup(PRIMARY_PIN_BOUNDARY_QUERY, batch, "pin_code,fname,state,circle");
      const missing = batch.filter((pin) => !primary.some((feature) => String(feature.properties.pin_code) === pin));
      const fallback = await lookup(FALLBACK_PIN_BOUNDARY_QUERY, missing,
        "pin_code,office_name,state,circle_name");
      const found = new Map<string, PinFeature[]>();
      for (const rawFeature of [...primary, ...fallback]) {
        const feature = normalizePinBoundaryFeature(rawFeature);
        const pin = String(feature.properties?.pin_code ?? "");
        if (!batch.includes(pin) || !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) continue;
        const matches = found.get(pin) ?? [];
        matches.push(feature);
        found.set(pin, matches);
      }
      // Missing polygons may appear later in the upstream dataset; do not cache misses forever.
      for (const [pin, features] of found) cache.set(pin, features);
    }
  }));
  return new Map(unique.map((pin) => [pin, cache.get(pin) ?? []]));
}
