import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appUsers, salespeople } from "@/db/schema";
import { usernameSchema, normalizeUsername } from "@/lib/access-contract";
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

  const [account] = await getDb()
    .select({ account: appUsers, salesperson: salespeople })
    .from(appUsers)
    .leftJoin(salespeople, eq(appUsers.salespersonId, salespeople.id))
    .where(eq(appUsers.username, normalizeUsername(parsed.data.username)))
    .limit(1);

  if (!account?.account.active || (account.account.role === "salesperson" && !account.salesperson?.active)) {
    return Response.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const result = await getAuth().signIn.email({
    email: account.account.authEmail,
    password: parsed.data.password,
  });
  if (result.error) {
    return Response.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  return Response.json({
    session: {
      userId: account.account.authUserId,
      username: account.account.username,
      displayName: account.account.displayName,
      role: account.account.role,
      salespersonId: account.account.salespersonId,
      salesperson: account.salesperson?.normalizedName ?? null,
    },
  });
}
