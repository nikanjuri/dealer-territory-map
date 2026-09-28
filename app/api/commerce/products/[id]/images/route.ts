import { canManageCommerce } from "@/lib/access-contract";
import { getAppSession } from "@/lib/authorization";
import { storeCommerceProductImage } from "@/lib/commerce-records";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request, context: RouteContext) {
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
  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return Response.json({ error: "Choose a valid image file." }, { status: 400 });
  }
  if (!file.size || file.size > MAX_IMAGE_BYTES) {
    return Response.json(
      { error: "Product images must be between 1 byte and 4 MB." },
      { status: 413 },
    );
  }
  try {
    const imageId = await storeCommerceProductImage({
      productId,
      fileName: file.name,
      contentType: file.type,
      base64Data: Buffer.from(await file.arrayBuffer()).toString("base64"),
    });
    return Response.json({ imageId }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && "code" in error && error.code === "23503"
            ? "Product not found."
            : "The image could not be stored.",
      },
      { status: 409 },
    );
  }
}
