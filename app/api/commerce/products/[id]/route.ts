import { getAppSession } from "@/lib/authorization";
import { canManageCommerce } from "@/lib/access-contract";
import { commerceProductInputSchema } from "@/lib/commerce-contract";
import { saveCommerceProduct } from "@/lib/commerce-records";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCommerce(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: rawId } = await context.params;
  const productId = Number(rawId);
  if (!Number.isInteger(productId) || productId <= 0) {
    return Response.json({ error: "Invalid product id." }, { status: 400 });
  }
  const parsed = commerceProductInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid product." },
      { status: 400 },
    );
  }
  try {
    const updatedId = await saveCommerceProduct(parsed.data, productId);
    if (!updatedId) {
      return Response.json({ error: "Product not found." }, { status: 404 });
    }
    return Response.json({ productId: updatedId });
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
