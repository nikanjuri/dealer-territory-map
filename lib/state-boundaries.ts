import { normalizeIndianState, type IndianState } from "./indian-states.ts";

// Match ISO identifiers, not upstream names (some contain diacritics).
export const STATE_BOUNDARY_CODES: Record<IndianState, string> = {
  Telangana: "IN-TG",
  "Andhra Pradesh": "IN-AP",
  Karnataka: "IN-KA",
  "Andaman and Nicobar Islands": "IN-AN",
  "Arunachal Pradesh": "IN-AR",
  Assam: "IN-AS",
  Bihar: "IN-BR",
  Chandigarh: "IN-CH",
  Chhattisgarh: "IN-CT",
  "Dadra and Nagar Haveli and Daman and Diu": "IN-DH",
  Delhi: "IN-DL",
  Goa: "IN-GA",
  Gujarat: "IN-GJ",
  Haryana: "IN-HR",
  "Himachal Pradesh": "IN-HP",
  "Jammu and Kashmir": "IN-JK",
  Jharkhand: "IN-JH",
  Kerala: "IN-KL",
  Ladakh: "IN-LA",
  Lakshadweep: "IN-LD",
  "Madhya Pradesh": "IN-MP",
  Maharashtra: "IN-MH",
  Manipur: "IN-MN",
  Meghalaya: "IN-ML",
  Mizoram: "IN-MZ",
  Nagaland: "IN-NL",
  Odisha: "IN-OR",
  Puducherry: "IN-PY",
  Punjab: "IN-PB",
  Rajasthan: "IN-RJ",
  Sikkim: "IN-SK",
  "Tamil Nadu": "IN-TN",
  Tripura: "IN-TR",
  "Uttar Pradesh": "IN-UP",
  Uttarakhand: "IN-UT",
  "West Bengal": "IN-WB",
};

export type StateBoundaryFeature = {
  type: "Feature";
  properties: Record<string, string | number | boolean | null> & {
    shapeISO: string;
    displayName: string;
    coverage: "context";
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};
export type StateBoundaryData = {
  type: "FeatureCollection";
  features: StateBoundaryFeature[];
};

export const EMPTY_STATE_BOUNDARIES: StateBoundaryData = {
  type: "FeatureCollection",
  features: [],
};

export function dealerStateBoundaryCodes(dealers: ReadonlyArray<{ state: string }>): string[] {
  return [...new Set(dealers.flatMap(({ state }) => {
    const canonical = normalizeIndianState(state);
    return canonical ? [STATE_BOUNDARY_CODES[canonical]] : [];
  }))].sort();
}

export const STATE_HIGHLIGHT_DEALER_THRESHOLD = 50;

/** Counts dealer markers, not unique postal PINs or paginated sidebar rows. */
export function highlightedStateBoundaryCodes(
  dealers: ReadonlyArray<{ state: string }>,
  selectedState = "all",
): string[] {
  const counts = new Map<IndianState, number>();
  for (const dealer of dealers) {
    const state = normalizeIndianState(dealer.state);
    if (state) counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  const explicitState = normalizeIndianState(selectedState);
  return [...counts]
    .filter(([state, count]) => count > STATE_HIGHLIGHT_DEALER_THRESHOLD || state === explicitState)
    .map(([state]) => STATE_BOUNDARY_CODES[state])
    .sort();
}

export function selectStateBoundaries(data: StateBoundaryData, codes: readonly string[]): StateBoundaryData {
  const selected = new Set(codes);
  return { type: "FeatureCollection", features: data.features.filter((feature) => selected.has(feature.properties.shapeISO)) };
}

export function stateBoundaryFeatureId(feature: StateBoundaryFeature): string {
  return `state-${feature.properties.shapeISO}`;
}

/** Public outlines only. Share completed/in-flight requests between map providers. */
export function createStateBoundaryLoader(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, Promise<StateBoundaryFeature>>();
  const knownCodes = new Set(Object.values(STATE_BOUNDARY_CODES));
  return async (codes: readonly string[]): Promise<{ data: StateBoundaryData; failedCodes: string[] }> => {
    const unique = [...new Set(codes)].sort();
    if (unique.some((code) => !knownCodes.has(code))) throw new Error("Unknown state boundary code.");
    const results = await Promise.all(unique.map(async (code) => {
      let pending = cache.get(code);
      if (!pending) {
        pending = (async () => {
          const response = await fetcher(`/state-boundaries/${code}.geojson`);
          if (!response.ok) throw new Error("State boundary failed to load.");
          const data = await response.json() as StateBoundaryData;
          const feature = data.features?.[0];
          if (data.type !== "FeatureCollection" || data.features?.length !== 1 ||
              feature?.type !== "Feature" || feature.properties?.shapeISO !== code ||
              feature.properties.coverage !== "context" ||
              !["Polygon", "MultiPolygon"].includes(feature.geometry?.type) ||
              !Array.isArray(feature.geometry.coordinates) || !feature.geometry.coordinates.length) {
            throw new Error("Invalid state boundary geometry.");
          }
          return feature;
        })();
        cache.set(code, pending);
      }
      try {
        return { feature: await pending, code };
      } catch {
        // Failed requests must be retryable; never cache an error as an empty state.
        if (cache.get(code) === pending) cache.delete(code);
        return { feature: null, code };
      }
    }));
    return {
      data: { type: "FeatureCollection", features: results.flatMap(({ feature }) => feature ? [feature] : []) },
      failedCodes: results.filter(({ feature }) => !feature).map(({ code }) => code),
    };
  };
}

export const loadStateBoundaries = createStateBoundaryLoader();
