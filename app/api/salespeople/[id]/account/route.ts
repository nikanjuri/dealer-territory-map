import { eq } from "drizzle-orm";
import { getSalespersonColor } from "@/app/dealers";
import { getDb } from "@/db";
import { appUsers, salespeople } from "@/db/schema";
import {
  authEmailForUsername,
  normalizeUsername,
  salespersonCredentialsSchema,
} from "@/lib/access-contract";
import { getAuth } from "@/lib/auth";
import { getAppSession, isAdmin } from "@/lib/authorization";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function serialize(
  salesperson: typeof salespeople.$inferSelect,
  account: typeof appUsers.$inferSelect,
) {
  return {
    id: salesperson.id,
    displayName: salesperson.displayName,
    normalizedName: salesperson.normalizedName,
    color: salesperson.color || getSalespersonColor(salesperson.normalizedName),
    active: salesperson.active,
    username: account.username,
    accountActive: account.active,
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) {
    return Response.json(
      { error: "Only an administrator can manage salesperson logins." },
      { status: 403 },
    );
  }

  const { id: rawId } = await context.params;
  const salespersonId = Number(rawId);
  if (!Number.isInteger(salespersonId) || salespersonId <= 0) {
    return Response.json({ error: "Invalid salesperson id." }, { status: 400 });
  }

  const parsed = salespersonCredentialsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid login details." },
      { status: 400 },
    );
  }

  const database = getDb();
  const [row] = await database
    .select({ salesperson: salespeople, account: appUsers })
    .from(salespeople)
    .leftJoin(appUsers, eq(appUsers.salespersonId, salespeople.id))
    .where(eq(salespeople.id, salespersonId))
    .limit(1);
  if (!row) {
    return Response.json({ error: "Salesperson not found." }, { status: 404 });
  }
  if (!row.salesperson.active) {
    return Response.json(
      { error: "Reactivate the salesperson before managing their login." },
      { status: 409 },
    );
  }

  if (row.account) {
    const passwordResult = await getAuth().admin.setUserPassword({
      userId: row.account.authUserId,
      newPassword: parsed.data.password,
    });
    if (passwordResult.error) {
      return Response.json(
        { error: passwordResult.error.message ?? "The password could not be reset." },
        { status: 502 },
      );
    }
    await getAuth().admin.revokeUserSessions({
      userId: row.account.authUserId,
    });
    return Response.json({
      salesperson: serialize(row.salesperson, row.account),
      passwordReset: true,
    });
  }

  if (!parsed.data.username) {
    return Response.json(
      { error: "Choose a username for this salesperson." },
      { status: 400 },
    );
  }
  const username = normalizeUsername(parsed.data.username);
  const [existingAccount] = await database
    .select({ id: appUsers.authUserId })
    .from(appUsers)
    .where(eq(appUsers.username, username))
    .limit(1);
  if (existingAccount) {
    return Response.json({ error: "That username is already in use." }, { status: 409 });
  }

  const authEmail = authEmailForUsername(username);
  const authResult = await getAuth().admin.createUser({
    email: authEmail,
    password: parsed.data.password,
    name: row.salesperson.displayName,
    role: "user",
  });
  if (authResult.error || !authResult.data?.user) {
    return Response.json(
      { error: authResult.error?.message ?? "The salesperson login could not be created." },
      { status: 502 },
    );
  }

  let account: typeof appUsers.$inferSelect;
  try {
    [account] = await database
      .insert(appUsers)
      .values({
        authUserId: authResult.data.user.id,
        username,
        authEmail,
        displayName: row.salesperson.displayName,
        role: "salesperson",
        salespersonId: row.salesperson.id,
      })
      .returning();
  } catch (error) {
    await getAuth().admin.removeUser({ userId: authResult.data.user.id });
    throw error;
  }

  return Response.json({
    salesperson: serialize(row.salesperson, account),
    passwordReset: false,
  });
}
