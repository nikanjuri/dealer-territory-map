import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appUserRoles,
  appUsers,
  dealers,
  retailerAccounts,
} from "@/db/schema";
import { deleteAppAccount } from "@/lib/account-records";
import {
  authEmailForUsername,
  normalizeUsername,
} from "@/lib/access-contract";
import {
  canDeleteCommerceAccount,
  createCommerceAccountSchema,
  deleteCommerceAccountSchema,
  resetCommercePasswordSchema,
  setCommerceAccountActiveSchema,
  updateOperationsAccessSchema,
} from "@/lib/commerce-contract";
import { listCommerceAccounts } from "@/lib/commerce-records";
import { getAuth } from "@/lib/auth";
import { getAppSession, isAdmin } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ accounts: await listCommerceAccounts() });
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const parsed = createCommerceAccountSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid account." },
      { status: 400 },
    );
  }
  const database = getDb();
  const username = normalizeUsername(parsed.data.username);
  const [existing] = await database
    .select({ id: appUsers.authUserId })
    .from(appUsers)
    .where(eq(appUsers.username, username))
    .limit(1);
  if (existing) {
    return Response.json({ error: "That username is already in use." }, { status: 409 });
  }
  if (parsed.data.role === "retailer") {
    const [dealer] = await database
      .select({ id: dealers.id })
      .from(dealers)
      .where(eq(dealers.id, parsed.data.dealerId!))
      .limit(1);
    if (!dealer) return Response.json({ error: "Dealer not found." }, { status: 404 });
  }

  const authEmail = authEmailForUsername(username);
  const authResult = await getAuth().admin.createUser({
    email: authEmail,
    password: parsed.data.password,
    name: parsed.data.displayName.trim(),
    role: "user",
  });
  if (authResult.error || !authResult.data?.user) {
    return Response.json(
      { error: authResult.error?.message ?? "The account could not be created." },
      { status: 502 },
    );
  }

  try {
    await database.insert(appUsers).values({
      authUserId: authResult.data.user.id,
      username,
      authEmail,
      displayName: parsed.data.displayName.trim(),
      role: parsed.data.role,
      salespersonId: null,
    });
    await database.insert(appUserRoles).values({
      authUserId: authResult.data.user.id,
      role: parsed.data.role,
    });
    if (parsed.data.role === "retailer") {
      await database.insert(retailerAccounts).values({
        authUserId: authResult.data.user.id,
        dealerId: parsed.data.dealerId!,
        phone: parsed.data.phone || null,
        contactName: parsed.data.displayName.trim(),
        shopName: parsed.data.shopName || null,
      });
    }
  } catch (error) {
    await database
      .delete(appUsers)
      .where(eq(appUsers.authUserId, authResult.data.user.id));
    await getAuth().admin.removeUser({ userId: authResult.data.user.id });
    throw error;
  }
  return Response.json({ accounts: await listCommerceAccounts() }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const body: unknown = await request.json();
  const activeUpdate = setCommerceAccountActiveSchema.safeParse(body);
  if (activeUpdate.success) {
    if (
      activeUpdate.data.authUserId === session.userId &&
      !activeUpdate.data.active
    ) {
      return Response.json(
        { error: "You cannot deactivate your own account." },
        { status: 409 },
      );
    }
    const [updated] = await getDb()
      .update(appUsers)
      .set({ active: activeUpdate.data.active, updatedAt: new Date() })
      .where(eq(appUsers.authUserId, activeUpdate.data.authUserId))
      .returning({ id: appUsers.authUserId });
    if (!updated) {
      return Response.json({ error: "Account not found." }, { status: 404 });
    }
    if (!activeUpdate.data.active) {
      await getAuth().admin.revokeUserSessions({ userId: updated.id });
    }
    return Response.json({ accounts: await listCommerceAccounts() });
  }

  const parsed = updateOperationsAccessSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid account update." }, { status: 400 });
  }
  const database = getDb();
  const [target] = await database
    .select()
    .from(appUsers)
    .where(eq(appUsers.authUserId, parsed.data.authUserId))
    .limit(1);
  if (!target) return Response.json({ error: "Account not found." }, { status: 404 });
  if (target.role === "retailer") {
    return Response.json(
      { error: "Retailer accounts cannot receive internal operations access." },
      { status: 409 },
    );
  }
  if (!parsed.data.enabled && target.role === "operations_staff") {
    return Response.json(
      { error: "This is the account's primary role and cannot be removed." },
      { status: 409 },
    );
  }
  if (parsed.data.enabled) {
    await database
      .insert(appUserRoles)
      .values({ authUserId: target.authUserId, role: "operations_staff" })
      .onConflictDoNothing();
  } else {
    await database
      .delete(appUserRoles)
      .where(
        and(
          eq(appUserRoles.authUserId, target.authUserId),
          eq(appUserRoles.role, "operations_staff"),
        ),
      );
  }
  return Response.json({ accounts: await listCommerceAccounts() });
}

export async function PUT(request: Request) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const parsed = resetCommercePasswordSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid password reset." },
      { status: 400 },
    );
  }
  const [target] = await getDb()
    .select({ id: appUsers.authUserId })
    .from(appUsers)
    .where(eq(appUsers.authUserId, parsed.data.authUserId))
    .limit(1);
  if (!target) return Response.json({ error: "Account not found." }, { status: 404 });

  const result = await getAuth().admin.setUserPassword({
    userId: target.id,
    newPassword: parsed.data.password,
  });
  if (result.error) {
    return Response.json(
      { error: result.error.message ?? "The password could not be reset." },
      { status: 502 },
    );
  }
  await getAuth().admin.revokeUserSessions({ userId: target.id });
  return Response.json({ passwordReset: true });
}

export async function DELETE(request: Request) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const parsed = deleteCommerceAccountSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid account deletion." }, { status: 400 });
  }
  if (parsed.data.authUserId === session.userId) {
    return Response.json(
      { error: "You cannot delete your own account." },
      { status: 409 },
    );
  }

  const database = getDb();
  const [targetRows, roleRows] = await Promise.all([
    database
      .select({
        authUserId: appUsers.authUserId,
        role: appUsers.role,
        salespersonId: appUsers.salespersonId,
      })
      .from(appUsers)
      .where(eq(appUsers.authUserId, parsed.data.authUserId))
      .limit(1),
    database
      .select({ role: appUserRoles.role })
      .from(appUserRoles)
      .where(eq(appUserRoles.authUserId, parsed.data.authUserId)),
  ]);
  const target = targetRows[0];
  if (!target) {
    return Response.json({ error: "Account not found." }, { status: 404 });
  }
  const roles = Array.from(
    new Set([target.role, ...roleRows.map(({ role }) => role)]),
  );
  if (
    !canDeleteCommerceAccount({
      roles,
      salespersonId: target.salespersonId,
    })
  ) {
    return Response.json(
      {
        error:
          "Administrator and salesperson accounts must be managed from the Team workspace.",
      },
      { status: 409 },
    );
  }

  const deletion = await deleteAppAccount(target.authUserId);
  if (!deletion.deleted) {
    return Response.json({ error: "Account not found." }, { status: 404 });
  }

  const accounts = await listCommerceAccounts();
  if (deletion.warning) {
    return Response.json({
      accounts,
      warning: deletion.warning,
    });
  }
  return Response.json({ accounts });
}
