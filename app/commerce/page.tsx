import { redirect } from "next/navigation";
import { canManageCommerce, landingPathForSession } from "@/lib/access-contract";
import { getAppSession } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function CommercePage() {
  const session = await getAppSession();
  if (!session) redirect("/auth/sign-in");
  if (!canManageCommerce(session)) redirect(landingPathForSession(session));
  redirect("/?workspace=commerce");
}
