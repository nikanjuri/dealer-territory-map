import { canUseRetailShop } from "@/lib/access-contract";
import { getAppSession } from "@/lib/authorization";
import {
  listCommerceOrders,
  listCommerceProducts,
} from "@/lib/commerce-records";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseRetailShop(session) || !session.dealerId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [products, orders] = await Promise.all([
    listCommerceProducts(false),
    listCommerceOrders(session.dealerId),
  ]);

  return Response.json({ products, orders });
}
