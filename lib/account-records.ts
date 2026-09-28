import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, commerceOrders } from "@/db/schema";
import { getAuth } from "@/lib/auth";

export async function deleteAppAccount(authUserId: string) {
  await getAuth().admin.revokeUserSessions({ userId: authUserId });

  const database = getDb();
  // Orders retain their dealer and retailer snapshots after the credentials
  // that placed them are removed.
  await database
    .update(commerceOrders)
    .set({ placedByUserId: null })
    .where(eq(commerceOrders.placedByUserId, authUserId));
  const [deleted] = await database
    .delete(appUsers)
    .where(eq(appUsers.authUserId, authUserId))
    .returning({ authUserId: appUsers.authUserId });
  if (!deleted) return { deleted: false as const };

  const authResult = await getAuth().admin.removeUser({ userId: authUserId });
  return {
    deleted: true as const,
    warning: authResult.error
      ? "App access was removed, but the unused authentication record could not be cleaned up automatically."
      : undefined,
  };
}
