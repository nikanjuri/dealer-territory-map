import "server-only";

import { and, desc, eq, inArray, max } from "drizzle-orm";
import { getDb } from "@/db";
import {
  dealers,
  routePlans,
  routeStops,
  salespeople,
  visitRules,
  visits,
} from "@/db/schema";
import type { Dealer } from "@/app/dealers";
import type {
  RoutePlanRequest,
  RouteStopStatus,
  RouteWorkspaceData,
  SavedRoutePlan,
} from "@/lib/route-contract";
import type { OptimizedRoute } from "@/lib/route-optimizer";
import {
  buildRouteSchedule,
  serializePlannedRouteStops,
} from "@/lib/route-schedule";

function normalizePerson(name: string) {
  return name.trim().replace(/\s+/g, " ").toUpperCase();
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export async function getDealersForRoute(
  salesperson: string,
  dealerIds: number[],
): Promise<Array<Dealer & { salespersonId: number; serviceMinutes: number }>> {
  const database = getDb();
  const rows = await database
    .select({ dealer: dealers, salesperson: salespeople, rule: visitRules })
    .from(dealers)
    .innerJoin(salespeople, eq(dealers.salespersonId, salespeople.id))
    .leftJoin(visitRules, eq(visitRules.dealerId, dealers.id))
    .where(
      and(
        eq(salespeople.normalizedName, normalizePerson(salesperson)),
        inArray(dealers.id, dealerIds),
      ),
    );

  return rows.map(({ dealer, salesperson: person, rule }) => ({
    id: dealer.id,
    salesperson: person.normalizedName,
    salespersonId: person.id,
    dealer: dealer.name,
    pincode: dealer.pincode,
    area: dealer.area,
    address: dealer.address ?? undefined,
    state: dealer.state,
    latitude: dealer.latitude,
    longitude: dealer.longitude,
    locationPrecision: dealer.locationPrecision,
    googlePlaceId: dealer.googlePlaceId ?? undefined,
    geocodedAddress: dealer.geocodedAddress ?? undefined,
    reviewNote: dealer.reviewNote ?? undefined,
    postalSuggestions: dealer.postalSuggestions ?? undefined,
    validationStatus: dealer.validationStatus,
    validationSource: dealer.validationSource ?? undefined,
    validationCheckedAt: dealer.validationCheckedAt?.toISOString(),
    validationDataset: dealer.validationDataset ?? undefined,
    serviceMinutes: rule?.serviceMinutes ?? 30,
  }));
}

export async function saveRoutePlan({
  request,
  optimized,
  provider,
  warning,
  createdBy,
  dealersForRoute,
  encodedPolyline,
}: {
  request: RoutePlanRequest;
  optimized: OptimizedRoute;
  provider: "google-routes" | "geometry-preview";
  warning: string | null;
  createdBy: string;
  dealersForRoute: Array<Dealer & { salespersonId: number; serviceMinutes: number }>;
  encodedPolyline?: string;
}) {
  const database = getDb();
  const salespersonId = dealersForRoute[0]?.salespersonId;
  if (!salespersonId) throw new Error("No matching salesperson was found.");

  const schedule = buildRouteSchedule({
    request,
    optimized,
    dealers: dealersForRoute,
  });
  const endAddress = request.returnToStart
    ? request.startAddress
    : request.endAddress ?? request.startAddress;
  const planStatus = provider === "google-routes" ? "optimized" : "draft";
  const summary = JSON.stringify({
    startAddress: request.startAddress,
    endAddress,
    returnToStart: request.returnToStart,
    totalDistanceMeters: optimized.totalDistanceMeters,
    totalDurationSeconds: optimized.totalDurationSeconds,
    totalServiceSeconds: schedule.totalServiceSeconds,
    totalPlannedSeconds: schedule.totalPlannedSeconds,
    estimatedEndAt: schedule.estimatedEndAt.toISOString(),
    warning,
    encodedPolyline,
  });
  const stops = serializePlannedRouteStops(schedule.stops);

  // One Postgres statement keeps the plan and all of its stops atomic even
  // through the Neon HTTP driver, which does not support interactive Drizzle
  // transactions.
  const rows = await database.$client`
    WITH inserted_plan AS (
      INSERT INTO route_plans (
        salesperson_id,
        route_date,
        status,
        workday_start,
        workday_end,
        optimization_provider,
        optimization_summary,
        created_by
      ) VALUES (
        ${salespersonId},
        ${request.routeDate}::date,
        ${planStatus}::route_plan_status,
        ${schedule.startAt.toISOString()}::timestamptz,
        ${schedule.endAt.toISOString()}::timestamptz,
        ${provider},
        ${summary}::jsonb,
        ${createdBy}
      )
      RETURNING id
    ), inserted_stops AS (
      INSERT INTO route_stops (
        route_plan_id,
        dealer_id,
        sequence,
        planned_arrival_at,
        planned_departure_at,
        travel_seconds,
        travel_meters,
        status
      )
      SELECT
        inserted_plan.id,
        stop.dealer_id,
        stop.sequence,
        stop.planned_arrival_at,
        stop.planned_departure_at,
        stop.travel_seconds,
        stop.travel_meters,
        'planned'::visit_status
      FROM inserted_plan
      CROSS JOIN jsonb_to_recordset(${stops}::jsonb) AS stop(
        dealer_id integer,
        sequence integer,
        planned_arrival_at timestamptz,
        planned_departure_at timestamptz,
        travel_seconds integer,
        travel_meters integer
      )
      RETURNING id
    )
    SELECT id FROM inserted_plan
  `;
  const planId = Number(rows[0]?.id);
  if (!Number.isInteger(planId)) {
    throw new Error("The route plan could not be saved.");
  }
  return planId;
}

export async function listRouteWorkspaceData(
  salespersonId?: number | null,
): Promise<RouteWorkspaceData> {
  const database = getDb();
  const planQuery = database
    .select({ plan: routePlans, salesperson: salespeople })
    .from(routePlans)
    .innerJoin(salespeople, eq(routePlans.salespersonId, salespeople.id))
    .orderBy(desc(routePlans.createdAt))
    .limit(20);
  const planRows = salespersonId
    ? await planQuery.where(eq(routePlans.salespersonId, salespersonId))
    : await planQuery;

  const plans: SavedRoutePlan[] = await Promise.all(
    planRows.map(async ({ plan, salesperson }) => {
      const stops = await database
        .select()
        .from(routeStops)
        .where(eq(routeStops.routePlanId, plan.id))
        .orderBy(routeStops.sequence);
      const summary = (plan.optimizationSummary ?? {}) as {
        startAddress?: string;
        endAddress?: string;
        totalDistanceMeters?: number;
        totalDurationSeconds?: number;
        totalServiceSeconds?: number;
        totalPlannedSeconds?: number;
        estimatedEndAt?: string;
        warning?: string | null;
      };
      return {
        id: plan.id,
        salesperson: salesperson.normalizedName,
        routeDate: plan.routeDate,
        status: plan.status,
        startAddress: summary.startAddress ?? "",
        endAddress: summary.endAddress ?? "",
        optimizationProvider: plan.optimizationProvider,
        totalDistanceMeters: summary.totalDistanceMeters ?? null,
        totalDurationSeconds: summary.totalDurationSeconds ?? null,
        totalServiceSeconds: summary.totalServiceSeconds ?? null,
        totalPlannedSeconds: summary.totalPlannedSeconds ?? null,
        estimatedEndAt: summary.estimatedEndAt ?? null,
        warning: summary.warning ?? null,
        stops: stops.map((stop) => ({
          id: stop.id,
          dealerId: stop.dealerId,
          sequence: stop.sequence,
          plannedArrivalAt: stop.plannedArrivalAt?.toISOString() ?? null,
          plannedDepartureAt: stop.plannedDepartureAt?.toISOString() ?? null,
          travelSeconds: stop.travelSeconds,
          travelMeters: stop.travelMeters,
          status: stop.status,
        })),
        createdAt: plan.createdAt.toISOString(),
      };
    }),
  );

  const scheduleQuery = database
    .select({
      dealerId: dealers.id,
      frequencyDays: visitRules.frequencyDays,
      nextDueAt: visitRules.nextDueAt,
      lastCompletedAt: max(visits.completedAt),
    })
    .from(dealers)
    .leftJoin(visitRules, eq(visitRules.dealerId, dealers.id))
    .leftJoin(
      visits,
      and(eq(visits.dealerId, dealers.id), eq(visits.status, "completed")),
    )
    .groupBy(dealers.id, visitRules.frequencyDays, visitRules.nextDueAt);
  const scheduleRows = salespersonId
    ? await scheduleQuery.where(eq(dealers.salespersonId, salespersonId))
    : await scheduleQuery;

  return {
    schedules: scheduleRows.map((row) => ({
      dealerId: row.dealerId,
      frequencyDays: row.frequencyDays ?? 30,
      nextDueAt: row.nextDueAt ?? null,
      lastCompletedAt: row.lastCompletedAt?.toISOString() ?? null,
    })),
    plans,
    googleOptimizationConfigured: Boolean(process.env.GOOGLE_ROUTES_API_KEY),
  };
}

export async function updateRouteStopStatus({
  planId,
  stopId,
  status,
  notes,
  userId,
  allowedSalespersonId,
}: {
  planId: number;
  stopId: number;
  status: RouteStopStatus;
  notes?: string;
  userId: string;
  allowedSalespersonId?: number | null;
}) {
  const database = getDb();
  const [record] = await database
    .select({ stop: routeStops, plan: routePlans })
    .from(routeStops)
    .innerJoin(routePlans, eq(routeStops.routePlanId, routePlans.id))
    .where(
      and(
        eq(routeStops.id, stopId),
        eq(routePlans.id, planId),
        allowedSalespersonId
          ? eq(routePlans.salespersonId, allowedSalespersonId)
          : undefined,
      ),
    )
    .limit(1);
  if (!record) return null;

  const now = new Date();
  const [updatedStop] = await database
    .update(routeStops)
    .set({ status })
    .where(eq(routeStops.id, stopId))
    .returning();
  const [existingVisit] = await database
    .select()
    .from(visits)
    .where(eq(visits.routeStopId, stopId))
    .orderBy(desc(visits.createdAt))
    .limit(1);

  const visitValues = {
    status,
    notes: notes || existingVisit?.notes || null,
    arrivedAt:
      status === "arrived" || status === "completed"
        ? existingVisit?.arrivedAt ?? now
        : existingVisit?.arrivedAt ?? null,
    completedAt: status === "completed" ? now : existingVisit?.completedAt ?? null,
  } as const;
  if (existingVisit) {
    await database.update(visits).set(visitValues).where(eq(visits.id, existingVisit.id));
  } else {
    await database.insert(visits).values({
      dealerId: record.stop.dealerId,
      routeStopId: stopId,
      salespersonId: record.plan.salespersonId,
      userId,
      ...visitValues,
    });
  }

  if (status === "completed") {
    const [rule] = await database
      .select()
      .from(visitRules)
      .where(eq(visitRules.dealerId, record.stop.dealerId))
      .limit(1);
    await database
      .insert(visitRules)
      .values({
        dealerId: record.stop.dealerId,
        frequencyDays: rule?.frequencyDays ?? 30,
        serviceMinutes: rule?.serviceMinutes ?? 30,
        priority: rule?.priority ?? 3,
        nextDueAt: addDays(now, rule?.frequencyDays ?? 30),
        active: true,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: visitRules.dealerId,
        set: {
          nextDueAt: addDays(now, rule?.frequencyDays ?? 30),
          updatedAt: now,
        },
      });
  }

  const planStops = await database
    .select({ status: routeStops.status })
    .from(routeStops)
    .where(eq(routeStops.routePlanId, planId));
  const nextPlanStatus = planStops.every((stop) =>
    ["completed", "skipped"].includes(stop.status),
  )
    ? "completed"
    : planStops.some((stop) => ["arrived", "completed"].includes(stop.status))
      ? "in_progress"
      : record.plan.status;
  await database
    .update(routePlans)
    .set({ status: nextPlanStatus, updatedAt: now })
    .where(eq(routePlans.id, planId));
  return updatedStop;
}
