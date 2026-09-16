import type { Dealer } from "@/app/dealers";
import type { RoutePlanRequest } from "@/lib/route-contract";
import type { OptimizedRoute } from "@/lib/route-optimizer";
import { googleDepartureTime } from "./route-schedule.ts";

export type GoogleRouteResponse = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    optimizedIntermediateWaypointIndex?: number[];
    legs?: Array<{ distanceMeters?: number; duration?: string }>;
    polyline?: { encodedPolyline?: string };
  }>;
  error?: { message?: string };
};

function durationSeconds(value?: string) {
  return value ? Math.round(Number.parseFloat(value.replace(/s$/, ""))) : 0;
}

export function routeEndpoint(value: string) {
  const match = value.match(
    /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/,
  );
  if (match) {
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180
    ) {
      return { location: { latLng: { latitude, longitude } } };
    }
  }
  return { address: value };
}

export function buildGoogleRoutesRequest(
  request: RoutePlanRequest,
  dealers: Dealer[],
  now = new Date(),
) {
  const departureTime = googleDepartureTime(request, now);
  return {
    origin: routeEndpoint(request.startAddress),
    destination: routeEndpoint(
      request.returnToStart
        ? request.startAddress
        : request.endAddress ?? request.startAddress,
    ),
    intermediates: dealers.map((dealer) =>
      dealer.googlePlaceId
        ? { placeId: dealer.googlePlaceId }
        : {
            location: {
              latLng: {
                latitude: dealer.latitude,
                longitude: dealer.longitude,
              },
            },
          },
    ),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    optimizeWaypointOrder: true,
    languageCode: "en-IN",
    units: "METRIC",
    ...(departureTime ? { departureTime } : {}),
  };
}

export function parseGoogleRoute(
  payload: GoogleRouteResponse,
  dealers: Dealer[],
): OptimizedRoute & { encodedPolyline?: string } {
  const route = payload.routes?.[0];
  if (!route) throw new Error("Google Routes could not optimize this plan.");
  const order =
    route.optimizedIntermediateWaypointIndex ?? dealers.map((_, index) => index);
  if (
    order.length !== dealers.length ||
    order.some((index) => !Number.isInteger(index) || !dealers[index])
  ) {
    throw new Error("Google Routes returned an invalid stop order.");
  }
  const legs = route.legs ?? [];
  return {
    dealerIds: order.map((index) => dealers[index].id),
    legMeters: legs.map((leg) => leg.distanceMeters ?? 0),
    legSeconds: legs.map((leg) => durationSeconds(leg.duration)),
    totalDistanceMeters: route.distanceMeters ?? 0,
    totalDurationSeconds: durationSeconds(route.duration),
    encodedPolyline: route.polyline?.encodedPolyline,
  };
}
