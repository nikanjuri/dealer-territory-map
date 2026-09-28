import { getAppSession } from "@/lib/authorization";
import { canAccessFieldWorkspace, hasRole } from "@/lib/access-contract";
import { listRouteWorkspaceData } from "@/lib/route-records";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAppSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canAccessFieldWorkspace(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return Response.json(
    await listRouteWorkspaceData(
      hasRole(session, "salesperson") && !hasRole(session, "admin")
        ? session.salespersonId
        : null,
    ),
  );
}
