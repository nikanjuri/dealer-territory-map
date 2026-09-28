import { z } from "zod";
import { canAccessFieldWorkspace } from "@/lib/access-contract";
import { getAppSession, isAdmin } from "@/lib/authorization";
import { getDealerRecord, getDealerVisitSummary } from "@/lib/dealer-records";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessFieldWorkspace(session) || (!isAdmin(session) && session.salespersonId === null)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = z.coerce.number().int().positive().safeParse((await context.params).id);
  if (!id.success) return Response.json({ error: "Invalid dealer id." }, { status: 400 });
  const dealer = await getDealerRecord(id.data, isAdmin(session) ? null : session.salespersonId);
  if (!dealer) return Response.json({ error: "Dealer not found." }, { status: 404 });
  return Response.json({ activity: await getDealerVisitSummary(id.data) });
}
