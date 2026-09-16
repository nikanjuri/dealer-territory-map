import type { PostalState } from "./postal-validation";

export type LocationPrecision = "address" | "pincode";

export type GeocodedLocation = {
  coordinates: [number, number];
  precision: LocationPrecision;
  resolvedAddress?: string;
};

type NominatimMatch = {
  lat: string;
  lon: string;
  display_name?: string;
  address?: {
    postcode?: string;
  };
};

type GeocodeInput = {
  address?: string;
  area: string;
  pincode: string;
  state: PostalState;
  pincodeFallback?: [number, number];
};

export function buildGeocodingQuery({
  address,
  area,
  pincode,
  state,
}: Omit<GeocodeInput, "pincodeFallback">) {
  return [address?.trim(), area.trim(), pincode, state, "India"]
    .filter(Boolean)
    .join(", ");
}

export async function geocodeDealerLocation(
  input: GeocodeInput,
  fetcher: typeof fetch = fetch,
): Promise<GeocodedLocation | null> {
  const address = input.address?.trim();
  if (!address && input.pincodeFallback) {
    return {
      coordinates: input.pincodeFallback,
      precision: "pincode",
    };
  }

  const parameters = new URLSearchParams({
    format: "jsonv2",
    limit: address ? "3" : "1",
    countrycodes: "in",
    addressdetails: "1",
    q: buildGeocodingQuery(input),
  });
  const response = await fetcher(
    `https://nominatim.openstreetmap.org/search?${parameters.toString()}`,
  );
  if (!response.ok) return null;

  const matches = (await response.json()) as NominatimMatch[];
  const usable = matches.filter((match) => {
    const latitude = Number(match.lat);
    const longitude = Number(match.lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude);
  });
  if (!usable.length) return null;

  const matchingPostcode = usable.find((match) =>
    match.address?.postcode?.split(/\D+/).includes(input.pincode),
  );
  const withoutPostcode = usable.find((match) => !match.address?.postcode);
  const match = address ? matchingPostcode ?? withoutPostcode : usable[0];
  if (!match) return null;

  return {
    coordinates: [Number(match.lon), Number(match.lat)],
    precision: address ? "address" : "pincode",
    resolvedAddress: address ? match.display_name : undefined,
  };
}
