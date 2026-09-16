import { getAppSession } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAppSession();
  return session
    ? Response.json({ session })
    : Response.json({ error: "This account is not assigned to the workspace." }, { status: 403 });
}
