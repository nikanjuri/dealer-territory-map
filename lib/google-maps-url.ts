import type { Dealer } from "@/app/dealers";
import type { SavedRoutePlan } from "@/lib/route-contract";

const UNIVERSAL_WAYPOINT_LIMIT = 3;

export type GoogleMapsRouteSegment = {
  href: string;
  label: string;
  stopStart: number;
  stopEnd: number;
};

function coordinates(dealer: Dealer) {
  return `${dealer.latitude},${dealer.longitude}`;
}

function directionsUrl(origin: string, destination: string, waypoints: string[]) {
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildGoogleMapsRouteSegments(
  plan: SavedRoutePlan,
  dealersById: Map<number, Dealer>,
): GoogleMapsRouteSegment[] {
  const stops = plan.stops
    .map((stop) => dealersById.get(stop.dealerId))
    .filter((dealer): dealer is Dealer => Boolean(dealer));
  if (!stops.length) return [];

  const segments: GoogleMapsRouteSegment[] = [];
  let origin = plan.startAddress;
  let stopOffset = 0;

  while (stops.length - stopOffset > UNIVERSAL_WAYPOINT_LIMIT) {
    const chunk = stops.slice(
      stopOffset,
      stopOffset + UNIVERSAL_WAYPOINT_LIMIT + 1,
    );
    const destination = coordinates(chunk.at(-1)!);
    const stopStart = stopOffset + 1;
    const stopEnd = stopOffset + chunk.length;
    segments.push({
      href: directionsUrl(
        origin,
        destination,
        chunk.slice(0, -1).map(coordinates),
      ),
      label: `Part ${segments.length + 1} · stops ${stopStart}–${stopEnd}`,
      stopStart,
      stopEnd,
    });
    origin = destination;
    stopOffset += chunk.length;
  }

  const remaining = stops.slice(stopOffset);
  const stopStart = stopOffset + 1;
  const stopEnd = stops.length;
  segments.push({
    href: directionsUrl(origin, plan.endAddress, remaining.map(coordinates)),
    label:
      segments.length === 0
        ? "Open in Google Maps"
        : remaining.length === 0
          ? `Part ${segments.length + 1} · finish`
        : `Part ${segments.length + 1} · stops ${stopStart}–${stopEnd}`,
    stopStart: remaining.length ? stopStart : stopEnd,
    stopEnd,
  });

  return segments;
}
