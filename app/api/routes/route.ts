import { getAppSession } from "@/lib/authorization";
import { listRouteWorkspaceData } from "@/lib/route-records";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAppSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(
    await listRouteWorkspaceData(
      session.role === "salesperson" ? session.salespersonId : null,
    ),
  );
}
