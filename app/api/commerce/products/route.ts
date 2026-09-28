import { getAppSession } from "@/lib/authorization";
import {
  canManageCommerce,
  canUseRetailShop,
} from "@/lib/access-contract";
import { commerceProductInputSchema } from "@/lib/commerce-contract";
import {
  listCommerceProducts,
  saveCommerceProduct,
} from "@/lib/commerce-records";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCommerce(session) && !canUseRetailShop(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return Response.json({
    products: await listCommerceProducts(canManageCommerce(session)),
  });
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCommerce(session)) {
    return Response.json(
      { error: "Only administrators and operations staff can manage products." },
      { status: 403 },
    );
  }
  const parsed = commerceProductInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid product." },
      { status: 400 },
    );
  }
  try {
    const productId = await saveCommerceProduct(parsed.data);
    return Response.json({ productId }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error &&
          (error.message === "Each variant SKU must be unique." ||
            ("code" in error && error.code === "23505"))
            ? "Each variant SKU must be unique."
            : "The product could not be saved.",
      },
      { status: 409 },
    );
  }
}
