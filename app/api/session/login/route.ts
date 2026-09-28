import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  appUserRoles,
  appUsers,
  dealers,
  retailerAccounts,
  salespeople,
} from "@/db/schema";
import {
  usernameSchema,
  normalizeUsername,
  type AppRole,
} from "@/lib/access-contract";
import { getAuth } from "@/lib/auth";

const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid username and password." }, { status: 400 });
  }

  const database = getDb();
  const [account] = await database
    .select({ account: appUsers, salesperson: salespeople })
    .from(appUsers)
    .leftJoin(salespeople, eq(appUsers.salespersonId, salespeople.id))
    .where(eq(appUsers.username, normalizeUsername(parsed.data.username)))
    .limit(1);

  if (!account?.account.active) {
    return Response.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const [roleRows, retailerRows] = await Promise.all([
    database
      .select({ role: appUserRoles.role })
      .from(appUserRoles)
      .where(eq(appUserRoles.authUserId, account.account.authUserId)),
    database
      .select({ account: retailerAccounts, dealer: dealers })
      .from(retailerAccounts)
      .innerJoin(dealers, eq(retailerAccounts.dealerId, dealers.id))
      .where(eq(retailerAccounts.authUserId, account.account.authUserId))
      .limit(1),
  ]);
  const roles = Array.from(
    new Set<AppRole>([
      account.account.role,
      ...roleRows.map(({ role }) => role),
    ]),
  );
  if (roles.includes("salesperson") && !account.salesperson?.active) {
    return Response.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const result = await getAuth().signIn.email({
    email: account.account.authEmail,
    password: parsed.data.password,
  });
  if (result.error) {
    return Response.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const retailer = retailerRows[0];

  return Response.json({
    session: {
      userId: account.account.authUserId,
      username: account.account.username,
      displayName: account.account.displayName,
      role: account.account.role,
      roles,
      salespersonId: account.account.salespersonId,
      salesperson: account.salesperson?.normalizedName ?? null,
      dealerId: retailer?.account.dealerId ?? null,
      dealer: retailer?.dealer.name ?? null,
    },
  });
}
