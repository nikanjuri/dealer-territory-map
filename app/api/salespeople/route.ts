import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers, salespeople } from "@/db/schema";
import {
  authEmailForUsername,
  createSalespersonSchema,
  normalizeSalespersonName,
  normalizeUsername,
} from "@/lib/access-contract";
import { getSalespersonColor } from "@/app/dealers";
import { getAuth } from "@/lib/auth";
import { getAppSession, isAdmin } from "@/lib/authorization";

export const dynamic = "force-dynamic";

function serialize(row: {
  salesperson: typeof salespeople.$inferSelect;
  account: typeof appUsers.$inferSelect | null;
}) {
  return {
    id: row.salesperson.id,
    displayName: row.salesperson.displayName,
    normalizedName: row.salesperson.normalizedName,
    color: row.salesperson.color,
    active: row.salesperson.active,
    username: row.account?.username ?? null,
    accountActive: row.account?.active ?? null,
  };
}

export async function GET() {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await getDb()
    .select({ salesperson: salespeople, account: appUsers })
    .from(salespeople)
    .leftJoin(appUsers, eq(appUsers.salespersonId, salespeople.id))
    .where(
      session.role === "salesperson" && session.salespersonId
        ? eq(salespeople.id, session.salespersonId)
        : undefined,
    )
    .orderBy(salespeople.displayName);

  return Response.json({ salespeople: rows.map(serialize) });
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) {
    return Response.json({ error: "Only an administrator can create salespeople." }, { status: 403 });
  }

  const parsed = createSalespersonSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid salesperson details." },
      { status: 400 },
    );
  }

  const username = normalizeUsername(parsed.data.username);
  const normalizedName = normalizeSalespersonName(parsed.data.displayName);
  const authEmail = authEmailForUsername(username);
  const database = getDb();

  const [existingAccount] = await database
    .select({ id: appUsers.authUserId })
    .from(appUsers)
    .where(eq(appUsers.username, username))
    .limit(1);
  if (existingAccount) {
    return Response.json({ error: "That username is already in use." }, { status: 409 });
  }

  let [person] = await database
    .select()
    .from(salespeople)
    .where(eq(salespeople.normalizedName, normalizedName))
    .limit(1);
  if (person) {
    const [linked] = await database
      .select({ id: appUsers.authUserId })
      .from(appUsers)
      .where(eq(appUsers.salespersonId, person.id))
      .limit(1);
    if (linked) {
      return Response.json({ error: "That salesperson already has a login." }, { status: 409 });
    }
  } else {
    [person] = await database
      .insert(salespeople)
      .values({
        normalizedName,
        displayName: parsed.data.displayName.trim(),
        color: getSalespersonColor(normalizedName),
      })
      .returning();
  }

  const authResult = await getAuth().admin.createUser({
    email: authEmail,
    password: parsed.data.password,
    name: parsed.data.displayName.trim(),
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
        displayName: parsed.data.displayName.trim(),
        role: "salesperson",
        salespersonId: person.id,
      })
      .returning();
  } catch (error) {
    await getAuth().admin.removeUser({ userId: authResult.data.user.id });
    throw error;
  }

  return Response.json({ salesperson: serialize({ salesperson: person, account }) }, { status: 201 });
}
