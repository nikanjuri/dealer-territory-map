import { getAppSession } from "@/lib/authorization";
import { canOperateOwnRoutes } from "@/lib/access-contract";
import { optimizeWithGoogleRoutes } from "@/lib/google-routes";
import { routePlanRequestSchema, type RoutePreview } from "@/lib/route-contract";
import { optimizeRoutePreview } from "@/lib/route-optimizer";
import {
  createRoutePreviewToken,
  routePreviewSecret,
} from "@/lib/route-preview";
import { routeFallbackWarning } from "@/lib/route-warning";
import {
  buildRouteSchedule,
  formatRouteDuration,
} from "@/lib/route-schedule";
import { getDealersForRoute } from "@/lib/route-records";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canOperateOwnRoutes(session)) {
    return Response.json(
      { error: "Only salespeople can create and optimize their own routes." },
      { status: 403 },
    );
  }
  const parsed = routePlanRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid route plan.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (parsed.data.salesperson !== session.salesperson) {
    return Response.json(
      { error: "Salespeople can optimize only their assigned routes." },
      { status: 403 },
    );
  }

  const routeDealers = await getDealersForRoute(
    parsed.data.salesperson,
    parsed.data.dealerIds,
  );
  if (routeDealers.length !== new Set(parsed.data.dealerIds).size) {
    return Response.json(
      { error: "Every selected dealer must belong to the selected salesperson." },
      { status: 400 },
    );
  }
  const approximate = routeDealers.filter(
    (dealer) => dealer.locationPrecision !== "address",
  );
  if (approximate.length && !parsed.data.includeApproximate) {
    return Response.json(
      {
        error: "Exact dealer locations are required for routing.",
        approximateDealerIds: approximate.map((dealer) => dealer.id),
      },
      { status: 400 },
    );
  }

  let provider: "google-routes" | "geometry-preview" = "google-routes";
  let warning: string | null = approximate.length
    ? `${approximate.length} stop${approximate.length === 1 ? " uses" : "s use"} an approximate PIN-code location.`
    : null;
  let encodedPolyline: string | undefined;
  let optimized;
  try {
    const googleResult = await optimizeWithGoogleRoutes(parsed.data, routeDealers);
    encodedPolyline = googleResult.encodedPolyline;
    optimized = googleResult;
  } catch {
    provider = "geometry-preview";
    optimized = optimizeRoutePreview(
      routeDealers.map((dealer) => ({
        dealerId: dealer.id,
        latitude: dealer.latitude,
        longitude: dealer.longitude,
      })),
    );
    warning = routeFallbackWarning(warning);
  }

  const schedule = buildRouteSchedule({
    request: parsed.data,
    optimized,
    dealers: routeDealers,
  });
  if (!schedule.fitsWorkday) {
    return Response.json(
      {
        error: `This route needs about ${formatRouteDuration(schedule.totalPlannedSeconds)} including dealer visits, which is ${formatRouteDuration(schedule.overrunSeconds)} beyond the selected workday. Remove stops or extend the finish time.`,
        code: "ROUTE_EXCEEDS_WORKDAY",
        requiredSeconds: schedule.totalPlannedSeconds,
        availableSeconds: schedule.availableSeconds,
        overrunSeconds: schedule.overrunSeconds,
      },
      { status: 422 },
    );
  }

  const token = createRoutePreviewToken({
    request: parsed.data,
    optimized,
    provider,
    warning,
    encodedPolyline,
  }, routePreviewSecret());
  const preview: RoutePreview = {
    token,
    salesperson: parsed.data.salesperson,
    routeDate: parsed.data.routeDate,
    startAddress: parsed.data.startAddress,
    endAddress: parsed.data.returnToStart
      ? parsed.data.startAddress
      : parsed.data.endAddress ?? parsed.data.startAddress,
    optimizationProvider: provider,
    totalDistanceMeters: optimized.totalDistanceMeters,
    totalDurationSeconds: optimized.totalDurationSeconds,
    totalServiceSeconds: schedule.totalServiceSeconds,
    totalPlannedSeconds: schedule.totalPlannedSeconds,
    estimatedEndAt: schedule.estimatedEndAt.toISOString(),
    warning,
    encodedPolyline,
    stops: schedule.stops.map((stop) => ({
      dealerId: stop.dealerId,
      sequence: stop.sequence,
      plannedArrivalAt: stop.plannedArrivalAt.toISOString(),
      plannedDepartureAt: stop.plannedDepartureAt.toISOString(),
      travelSeconds: stop.travelSeconds,
      travelMeters: stop.travelMeters,
    })),
  };
  return Response.json({ preview });
}
