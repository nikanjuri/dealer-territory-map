import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, salespeople } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import type { AppSession } from "@/lib/access-contract";

export async function getAppSession(): Promise<AppSession | null> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return null;

  const [row] = await getDb()
    .select({ account: appUsers, salesperson: salespeople })
    .from(appUsers)
    .leftJoin(salespeople, eq(appUsers.salespersonId, salespeople.id))
    .where(eq(appUsers.authUserId, session.user.id))
    .limit(1);

  if (!row?.account.active) return null;
  if (row.account.role === "salesperson" && !row.salesperson?.active) return null;

  return {
    userId: row.account.authUserId,
    username: row.account.username,
    displayName: row.account.displayName,
    role: row.account.role,
    salespersonId: row.account.salespersonId,
    salesperson: row.salesperson?.normalizedName ?? null,
  };
}

export function isAdmin(session: AppSession) {
  return session.role === "admin";
}
