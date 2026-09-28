import { getAppSession, isAdmin } from "@/lib/authorization";
import { listPendingDealerImportReviews } from "@/lib/dealer-review-records";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ reviews: await listPendingDealerImportReviews() });
}
