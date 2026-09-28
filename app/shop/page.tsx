import { redirect } from "next/navigation";
import { canUseRetailShop, landingPathForSession } from "@/lib/access-contract";
import { getAppSession } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function ShopPage() {
  const session = await getAppSession();
  if (!session) redirect("/auth/sign-in");
  if (!canUseRetailShop(session) || !session.dealerId) {
    redirect(landingPathForSession(session));
  }
  redirect("/?workspace=shop");
}
