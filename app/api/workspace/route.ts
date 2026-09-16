import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, salespeople } from "@/db/schema";
import { getAppSession } from "@/lib/authorization";
import { listDealerRecords } from "@/lib/dealer-records";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAppSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [dealers, rows] = await Promise.all([
    listDealerRecords(
      session.role === "salesperson" ? session.salespersonId : null,
    ),
    getDb()
      .select({ salesperson: salespeople, account: appUsers })
      .from(salespeople)
      .leftJoin(appUsers, eq(appUsers.salespersonId, salespeople.id))
      .where(
        session.role === "salesperson" && session.salespersonId
          ? eq(salespeople.id, session.salespersonId)
          : undefined,
      )
      .orderBy(salespeople.displayName),
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
  });
}
