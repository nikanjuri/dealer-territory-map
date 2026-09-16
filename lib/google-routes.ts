import "server-only";

import type { Dealer } from "@/app/dealers";
import type { RoutePlanRequest } from "@/lib/route-contract";
import type { OptimizedRoute } from "@/lib/route-optimizer";
import {
  buildGoogleRoutesRequest,
  parseGoogleRoute,
  type GoogleRouteResponse,
} from "@/lib/google-routes-core";

export async function optimizeWithGoogleRoutes(
  request: RoutePlanRequest,
  dealers: Dealer[],
): Promise<OptimizedRoute & { encodedPolyline?: string }> {
  const apiKey = process.env.GOOGLE_ROUTES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_ROUTES_API_KEY is not configured.");

  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex,routes.legs.distanceMeters,routes.legs.duration,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify(buildGoogleRoutesRequest(request, dealers)),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const payload = (await response.json()) as GoogleRouteResponse;
  if (!response.ok || !payload.routes?.length) {
    throw new Error(payload.error?.message ?? "Google Routes could not optimize this plan.");
  }

  return parseGoogleRoute(payload, dealers);
}
