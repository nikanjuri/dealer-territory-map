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
  previewKey,
  dealersForRoute,
  encodedPolyline,
}: {
  request: RoutePlanRequest;
  optimized: OptimizedRoute;
  provider: "google-routes" | "geometry-preview";
  warning: string | null;
  createdBy: string;
  previewKey: string;
  dealersForRoute: Array<Dealer & { salespersonId: number; serviceMinutes: number }>;
  encodedPolyline?: string;
}) {
  const database = getDb();
  const salespersonId = dealersForRoute[0]?.salespersonId;
  if (!salespersonId) throw new Error("No matching salesperson was found.");
  const [existingPlan] = await database.select({
    id: routePlans.id, salespersonId: routePlans.salespersonId, createdBy: routePlans.createdBy,
  }).from(routePlans).where(eq(routePlans.previewKey, previewKey)).limit(1);
  if (existingPlan) {
    if (existingPlan.salespersonId !== salespersonId || existingPlan.createdBy !== createdBy) {
      throw new Error("This route preview belongs to another account.");
    }
    return existingPlan.id;
  }

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
        created_by,
        preview_key
      ) VALUES (
        ${salespersonId},
        ${request.routeDate}::date,
        ${planStatus}::route_plan_status,
        ${schedule.startAt.toISOString()}::timestamptz,
        ${schedule.endAt.toISOString()}::timestamptz,
        ${provider},
        ${summary}::jsonb,
        ${createdBy},
        ${previewKey}
      )
      ON CONFLICT (preview_key) DO NOTHING
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
  if (!Number.isInteger(planId) || planId < 1) {
    const [concurrentPlan] = await database.select({
      id: routePlans.id, salespersonId: routePlans.salespersonId, createdBy: routePlans.createdBy,
    }).from(routePlans).where(eq(routePlans.previewKey, previewKey)).limit(1);
    if (concurrentPlan?.salespersonId === salespersonId && concurrentPlan.createdBy === createdBy) {
      return concurrentPlan.id;
    }
    throw new Error("The route save could not be reconciled. Refresh route history.");
  }
  return planId;
}

export async function findSavedRouteByPreviewKey(
  previewKey: string,
  userId: string,
  salespersonId: number,
): Promise<SavedRoutePlan | null> {
  const database = getDb();
  const [row] = await database.select({ plan: routePlans, salesperson: salespeople })
    .from(routePlans)
    .innerJoin(salespeople, eq(routePlans.salespersonId, salespeople.id))
    .where(and(
      eq(routePlans.previewKey, previewKey),
      eq(routePlans.createdBy, userId),
      eq(routePlans.salespersonId, salespersonId),
    ))
    .limit(1);
  if (!row) return null;
  const stops = await database.select().from(routeStops)
    .where(eq(routeStops.routePlanId, row.plan.id))
    .orderBy(routeStops.sequence);
  return serializeSavedPlan(row.plan, row.salesperson, stops);
}

function serializeSavedPlan(
  plan: typeof routePlans.$inferSelect,
  salesperson: typeof salespeople.$inferSelect,
  stops: Array<typeof routeStops.$inferSelect>,
): SavedRoutePlan {
  const summary = (plan.optimizationSummary ?? {}) as {
    startAddress?: string;
    endAddress?: string;
    totalDistanceMeters?: number;
    totalDurationSeconds?: number;
    totalServiceSeconds?: number;
    totalPlannedSeconds?: number;
    estimatedEndAt?: string;
    warning?: string | null;
    encodedPolyline?: string;
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
    encodedPolyline: summary.encodedPolyline,
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
    updatedAt: plan.updatedAt.toISOString(),
  };
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
    .limit(200);
  const planRows = salespersonId
    ? await planQuery.where(eq(routePlans.salespersonId, salespersonId))
    : await planQuery;

  const allStops = planRows.length
    ? await database.select().from(routeStops)
        .where(inArray(routeStops.routePlanId, planRows.map(({ plan }) => plan.id)))
        .orderBy(routeStops.routePlanId, routeStops.sequence)
    : [];
  const stopsByPlan = new Map<number, typeof allStops>();
  for (const stop of allStops) {
    const group = stopsByPlan.get(stop.routePlanId) ?? [];
    group.push(stop);
    stopsByPlan.set(stop.routePlanId, group);
  }
  const plans: SavedRoutePlan[] = planRows.map(({ plan, salesperson }) =>
    serializeSavedPlan(plan, salesperson, stopsByPlan.get(plan.id) ?? []));

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
  const now = new Date();
  // A single statement keeps the stop, visit, next-due rule, and plan status
  // together on the Neon HTTP driver. Locking the stop serializes retries.
  const rows = await getDb().$client`
    WITH target AS (
      SELECT stop.id AS stop_id, stop.dealer_id, stop.status AS previous_status,
             plan.salesperson_id, plan.id AS plan_id
      FROM route_stops stop
      JOIN route_plans plan ON plan.id = stop.route_plan_id
      WHERE stop.id = ${stopId} AND plan.id = ${planId}
        AND (${allowedSalespersonId ?? null}::integer IS NULL
          OR plan.salesperson_id = ${allowedSalespersonId ?? null})
      FOR UPDATE OF stop
    ), changed AS (
      UPDATE route_stops stop SET status = ${status}::visit_status
      FROM target
      WHERE stop.id = target.stop_id
        AND target.previous_status IN ('planned', 'arrived')
        AND target.previous_status <> ${status}::visit_status
      RETURNING stop.id AS stop_id, target.dealer_id,
                target.salesperson_id, target.plan_id, stop.status AS new_status
    ), updated_visit AS (
      UPDATE visits visit SET
        status = changed.new_status,
        notes = COALESCE(NULLIF(${notes ?? null}::text, ''), visit.notes),
        arrived_at = CASE WHEN changed.new_status IN ('arrived', 'completed')
                          THEN COALESCE(visit.arrived_at, ${now.toISOString()}::timestamptz)
                          ELSE visit.arrived_at END,
        completed_at = CASE WHEN changed.new_status = 'completed'
                            THEN COALESCE(visit.completed_at, ${now.toISOString()}::timestamptz)
                            ELSE visit.completed_at END
      FROM changed
      WHERE visit.id = (SELECT id FROM visits WHERE route_stop_id = changed.stop_id
                        ORDER BY created_at DESC, id DESC LIMIT 1)
      RETURNING visit.id
    ), inserted_visit AS (
      INSERT INTO visits (dealer_id, route_stop_id, salesperson_id, user_id,
                          status, notes, arrived_at, completed_at)
      SELECT changed.dealer_id, changed.stop_id, changed.salesperson_id,
             ${userId}, changed.new_status, ${notes ?? null},
             CASE WHEN changed.new_status IN ('arrived', 'completed')
                  THEN ${now.toISOString()}::timestamptz ELSE NULL END,
             CASE WHEN changed.new_status = 'completed'
                  THEN ${now.toISOString()}::timestamptz ELSE NULL END
      FROM changed WHERE NOT EXISTS (SELECT 1 FROM updated_visit)
      RETURNING id
    ), updated_rule AS (
      INSERT INTO visit_rules (dealer_id, frequency_days, service_minutes,
                               priority, next_due_at, active, updated_at)
      SELECT changed.dealer_id, COALESCE(rule.frequency_days, 30),
             COALESCE(rule.service_minutes, 30), COALESCE(rule.priority, 3),
             (${now.toISOString()}::timestamptz +
               COALESCE(rule.frequency_days, 30) * INTERVAL '1 day')::date,
             TRUE, ${now.toISOString()}::timestamptz
      FROM changed LEFT JOIN visit_rules rule ON rule.dealer_id = changed.dealer_id
      WHERE changed.new_status = 'completed'
      ON CONFLICT (dealer_id) DO UPDATE SET
        next_due_at = EXCLUDED.next_due_at,
        updated_at = EXCLUDED.updated_at
      RETURNING dealer_id
    ), updated_plan AS (
      UPDATE route_plans plan SET
        status = CASE
          WHEN (SELECT bool_and(COALESCE(changed.new_status, stop.status)
                    IN ('completed', 'skipped'))
                FROM route_stops stop LEFT JOIN changed ON changed.stop_id = stop.id
                WHERE stop.route_plan_id = plan.id) THEN 'completed'::route_plan_status
          WHEN (SELECT bool_or(COALESCE(changed.new_status, stop.status)
                    IN ('arrived', 'completed'))
                FROM route_stops stop LEFT JOIN changed ON changed.stop_id = stop.id
                WHERE stop.route_plan_id = plan.id) THEN 'in_progress'::route_plan_status
          ELSE plan.status END,
        updated_at = ${now.toISOString()}::timestamptz
      WHERE plan.id = ${planId} AND EXISTS (SELECT 1 FROM changed)
      RETURNING plan.id
    )
    SELECT target.stop_id AS id, target.previous_status,
           changed.new_status AS status
    FROM target LEFT JOIN changed ON changed.stop_id = target.stop_id
  `;
  const row = rows[0] as { id: number; previous_status: string; status: string | null } | undefined;
  if (!row) return null;
  if (!row.status && row.previous_status !== status) {
    throw new Error("This stop is already finished. Refresh the route to see its latest status.");
  }
  return { id: row.id, status: row.status ?? row.previous_status };
}
