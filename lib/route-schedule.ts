import type { RoutePlanRequest } from "@/lib/route-contract";
import type { OptimizedRoute } from "@/lib/route-optimizer";

export type RouteDealerTiming = {
  id: number;
  serviceMinutes: number;
};

export type PlannedRouteStop = {
  dealerId: number;
  sequence: number;
  plannedArrivalAt: Date;
  plannedDepartureAt: Date;
  travelSeconds: number;
  travelMeters: number | null;
};

export type RouteSchedule = {
  startAt: Date;
  endAt: Date;
  estimatedEndAt: Date;
  totalServiceSeconds: number;
  totalPlannedSeconds: number;
  availableSeconds: number;
  overrunSeconds: number;
  fitsWorkday: boolean;
  stops: PlannedRouteStop[];
};

export function indiaDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00+05:30`);
}

export function googleDepartureTime(
  request: Pick<RoutePlanRequest, "routeDate" | "workdayStart">,
  now = new Date(),
) {
  const planned = indiaDateTime(request.routeDate, request.workdayStart);
  return planned.getTime() > now.getTime() ? planned.toISOString() : undefined;
}

export function buildRouteSchedule({
  request,
  optimized,
  dealers,
}: {
  request: Pick<RoutePlanRequest, "routeDate" | "workdayStart" | "workdayEnd">;
  optimized: OptimizedRoute;
  dealers: RouteDealerTiming[];
}): RouteSchedule {
  const startAt = indiaDateTime(request.routeDate, request.workdayStart);
  const endAt = indiaDateTime(request.routeDate, request.workdayEnd);
  const byId = new Map(dealers.map((dealer) => [dealer.id, dealer]));
  let clock = startAt.getTime();
  let totalServiceSeconds = 0;

  const stops = optimized.dealerIds.map((dealerId, index) => {
    const dealer = byId.get(dealerId);
    if (!dealer) throw new Error("Optimized route contained an unknown dealer.");
    const travelSeconds = optimized.legSeconds[index] ?? 0;
    clock += travelSeconds * 1_000;
    const plannedArrivalAt = new Date(clock);
    const serviceSeconds = dealer.serviceMinutes * 60;
    totalServiceSeconds += serviceSeconds;
    clock += serviceSeconds * 1_000;

    return {
      dealerId,
      sequence: index + 1,
      plannedArrivalAt,
      plannedDepartureAt: new Date(clock),
      travelSeconds,
      travelMeters: optimized.legMeters[index] ?? null,
    };
  });

  const totalPlannedSeconds =
    optimized.totalDurationSeconds + totalServiceSeconds;
  const availableSeconds = Math.max(
    0,
    Math.round((endAt.getTime() - startAt.getTime()) / 1_000),
  );
  const overrunSeconds = Math.max(0, totalPlannedSeconds - availableSeconds);

  return {
    startAt,
    endAt,
    estimatedEndAt: new Date(startAt.getTime() + totalPlannedSeconds * 1_000),
    totalServiceSeconds,
    totalPlannedSeconds,
    availableSeconds,
    overrunSeconds,
    fitsWorkday: overrunSeconds === 0,
    stops,
  };
}

export function formatRouteDuration(seconds: number) {
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export function serializePlannedRouteStops(stops: PlannedRouteStop[]) {
  return JSON.stringify(
    stops.map((stop) => ({
      dealer_id: stop.dealerId,
      sequence: stop.sequence,
      planned_arrival_at: stop.plannedArrivalAt.toISOString(),
      planned_departure_at: stop.plannedDepartureAt.toISOString(),
      travel_seconds: stop.travelSeconds,
      travel_meters: stop.travelMeters,
    })),
  );
}
