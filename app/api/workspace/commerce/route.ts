import { canManageCommerce } from "@/lib/access-contract";
import { getAppSession, isAdmin } from "@/lib/authorization";
import {
  getCommerceStats,
  listCommerceAccounts,
  listCommerceCategories,
  listCommerceOrders,
  listCommerceProducts,
} from "@/lib/commerce-records";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCommerce(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [products, categories, orders, stats, accounts] = await Promise.all([
    listCommerceProducts(true),
    listCommerceCategories(true),
    listCommerceOrders(),
    getCommerceStats(),
    isAdmin(session) ? listCommerceAccounts() : Promise.resolve([]),
  ]);

  return Response.json({ products, categories, orders, stats, accounts });
}
