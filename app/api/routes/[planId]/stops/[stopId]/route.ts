import { z } from "zod";
import { canOperateOwnRoutes } from "@/lib/access-contract";
import { getAppSession } from "@/lib/authorization";
import { routeStopStatusSchema } from "@/lib/route-contract";
import { listRouteWorkspaceData, updateRouteStopStatus } from "@/lib/route-records";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ planId: string; stopId: string }> },
) {
  const session = await getAppSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canOperateOwnRoutes(session)) {
    return Response.json(
      { error: "Only salespeople can update their route visits." },
      { status: 403 },
    );
  }
  const params = await context.params;
  const ids = z
    .object({
      planId: z.coerce.number().int().positive(),
      stopId: z.coerce.number().int().positive(),
    })
    .safeParse(params);
  const body = routeStopStatusSchema.safeParse(await request.json());
  if (!ids.success || !body.success) {
    return Response.json({ error: "Invalid visit update." }, { status: 400 });
  }

  const updated = await updateRouteStopStatus({
    ...ids.data,
    ...body.data,
    userId: session.userId,
    allowedSalespersonId: session.salespersonId,
  });
  if (!updated) {
    return Response.json({ error: "Route stop not found." }, { status: 404 });
  }
  return Response.json(
    await listRouteWorkspaceData(
      session.salespersonId,
    ),
  );
}
