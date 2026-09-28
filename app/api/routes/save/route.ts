import { createHash } from "node:crypto";
import { canOperateOwnRoutes } from "@/lib/access-contract";
import { getAppSession } from "@/lib/authorization";
import { routePreviewSaveSchema } from "@/lib/route-contract";
import {
  readRoutePreviewToken,
  routePreviewSecret,
} from "@/lib/route-preview";
import { buildRouteSchedule, formatRouteDuration } from "@/lib/route-schedule";
import {
  getDealersForRoute,
  findSavedRouteByPreviewKey,
  listRouteWorkspaceData,
  saveRoutePlan,
} from "@/lib/route-records";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canOperateOwnRoutes(session)) {
    return Response.json(
      { error: "Only salespeople can save their own routes." },
      { status: 403 },
    );
  }

  const parsed = routePreviewSaveSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid route preview." }, { status: 400 });
  }

  const previewKey = createHash("sha256").update(parsed.data.token).digest("hex");
  let preview;
  try {
    preview = readRoutePreviewToken(parsed.data.token, routePreviewSecret());
  } catch (error) {
    // A response may be lost after a successful save. Recover the existing
    // account-owned plan even if the short-lived preview has since expired.
    const savedPlan = await findSavedRouteByPreviewKey(previewKey, session.userId, session.salespersonId!);
    if (savedPlan) return Response.json({ plan: savedPlan }, { status: 200 });
    return Response.json(
      { error: error instanceof Error ? error.message : "Invalid route preview." },
      { status: 400 },
    );
  }
  if (preview.request.salesperson !== session.salesperson) {
    return Response.json(
      { error: "Salespeople can save only their assigned routes." },
      { status: 403 },
    );
  }

  const routeDealers = await getDealersForRoute(
    preview.request.salesperson,
    preview.request.dealerIds,
  );
  if (routeDealers.length !== new Set(preview.request.dealerIds).size) {
    return Response.json(
      { error: "Dealer assignments changed. Optimize this route again." },
      { status: 409 },
    );
  }
  const approximate = routeDealers.filter(
    (dealer) => dealer.locationPrecision !== "address",
  );
  if (approximate.length && !preview.request.includeApproximate) {
    return Response.json(
      { error: "Dealer locations changed. Optimize this route again." },
      { status: 409 },
    );
  }

  const schedule = buildRouteSchedule({
    request: preview.request,
    optimized: preview.optimized,
    dealers: routeDealers,
  });
  if (!schedule.fitsWorkday) {
    return Response.json(
      {
        error: `This route now needs about ${formatRouteDuration(schedule.totalPlannedSeconds)}, which is ${formatRouteDuration(schedule.overrunSeconds)} beyond the workday. Optimize it again.`,
      },
      { status: 409 },
    );
  }

  const planId = await saveRoutePlan({
    request: preview.request,
    optimized: preview.optimized,
    provider: preview.provider,
    warning: preview.warning,
    createdBy: session.userId,
    previewKey,
    dealersForRoute: routeDealers,
    encodedPolyline: preview.encodedPolyline,
  });
  const workspace = await listRouteWorkspaceData(session.salespersonId);
  const plan = workspace.plans.find((candidate) => candidate.id === planId);
  if (!plan) {
    return Response.json(
      { error: "The route was saved but could not be reloaded." },
      { status: 500 },
    );
  }
  return Response.json({ plan }, { status: 201 });
}
