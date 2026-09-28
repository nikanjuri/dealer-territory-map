import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, salespeople } from "@/db/schema";
import {
  canAccessFieldWorkspace,
  canManageCommerce,
  canUseRetailShop,
} from "@/lib/access-contract";
import { getAppSession, isAdmin } from "@/lib/authorization";
import { listDealerSummaries } from "@/lib/dealer-records";
import { countPendingDealerImportReviews } from "@/lib/dealer-review-records";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = performance.now();
  const session = await getAppSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const fieldAccess = canAccessFieldWorkspace(session);
  if (fieldAccess && !isAdmin(session) && session.salespersonId === null) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const commerceAccess = canManageCommerce(session);
  const shopAccess = canUseRetailShop(session);

  const [dealers, rows, pendingDealerReviewCount] = await Promise.all([
    fieldAccess
      ? listDealerSummaries(isAdmin(session) ? null : session.salespersonId)
      : Promise.resolve([]),
    fieldAccess
      ? getDb()
          .select({ salesperson: salespeople, account: appUsers })
          .from(salespeople)
          .leftJoin(appUsers, eq(appUsers.salespersonId, salespeople.id))
          .where(
            !isAdmin(session) && session.salespersonId
              ? eq(salespeople.id, session.salespersonId)
              : undefined,
          )
          .orderBy(salespeople.displayName)
      : Promise.resolve([]),
    isAdmin(session) ? countPendingDealerImportReviews() : Promise.resolve(0),
  ]);

  return Response.json({
    session,
    dealers,
    salespeople: rows.map(({ salesperson, account }) => ({
      id: salesperson.id,
      displayName: salesperson.displayName,
      normalizedName: salesperson.normalizedName,
      color: salesperson.color,
      active: salesperson.active,
      username: account?.username ?? null,
      accountActive: account?.active ?? null,
    })),
    access: {
      field: fieldAccess,
      commerce: commerceAccess,
      shop: shopAccess,
    },
    pendingDealerReviewCount,
  }, {
    headers: {
      "Cache-Control": "private, no-store",
      "Server-Timing": `workspace;dur=${(performance.now() - startedAt).toFixed(1)}`,
    },
  });
}
