import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appUserRoles,
  appUsers,
  dealers,
  retailerAccounts,
  salespeople,
} from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { hasRole, type AppRole, type AppSession } from "@/lib/access-contract";

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    cause?: { code?: unknown };
  };
  return candidate.code === "42P01" || candidate.cause?.code === "42P01";
}

export async function getAppSession(): Promise<AppSession | null> {
  const { data: session } = await getAuth().getSession();
  if (!session?.user) return null;

  const database = getDb();
  const [row] = await database
    .select({ account: appUsers, salesperson: salespeople })
    .from(appUsers)
    .leftJoin(salespeople, eq(appUsers.salespersonId, salespeople.id))
    .where(eq(appUsers.authUserId, session.user.id))
    .limit(1);

  if (!row?.account.active) return null;
  let roles: AppRole[] = [row.account.role];
  let dealerId: number | null = null;
  let dealer: string | null = null;

  try {
    const [roleRows, retailerRows] = await Promise.all([
      database
        .select({ role: appUserRoles.role })
        .from(appUserRoles)
        .where(eq(appUserRoles.authUserId, row.account.authUserId)),
      database
        .select({ account: retailerAccounts, dealer: dealers })
        .from(retailerAccounts)
        .innerJoin(dealers, eq(retailerAccounts.dealerId, dealers.id))
        .where(eq(retailerAccounts.authUserId, row.account.authUserId))
        .limit(1),
    ]);
    roles = Array.from(
      new Set<AppRole>([
        row.account.role,
        ...roleRows.map(({ role }) => role),
      ]),
    );
    dealerId = retailerRows[0]?.account.dealerId ?? null;
    dealer = retailerRows[0]?.dealer.name ?? null;
  } catch (error) {
    // Keep the existing field workspace usable while a newly generated access
    // migration is still pending. Other database failures must remain visible.
    if (!isMissingRelationError(error)) throw error;
  }

  if (roles.includes("salesperson") && !row.salesperson?.active) return null;

  return {
    userId: row.account.authUserId,
    username: row.account.username,
    displayName: row.account.displayName,
    role: row.account.role,
    roles,
    salespersonId: row.account.salespersonId,
    salesperson: row.salesperson?.normalizedName ?? null,
    dealerId,
    dealer,
  };
}

export function isAdmin(session: AppSession) {
  return hasRole(session, "admin");
}
