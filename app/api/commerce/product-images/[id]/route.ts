import { canManageCommerce, canUseRetailShop } from "@/lib/access-contract";
import { getAppSession } from "@/lib/authorization";
import {
  deleteCommerceProductImage,
  getCommerceProductImage,
} from "@/lib/commerce-records";

type RouteContext = { params: Promise<{ id: string }> };

function imageId(rawId: string) {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCommerce(session) && !canUseRetailShop(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: rawId } = await context.params;
  const id = imageId(rawId);
  if (!id) return Response.json({ error: "Invalid image id." }, { status: 400 });
  const storedImage = await getCommerceProductImage(id);
  if (!storedImage) return Response.json({ error: "Image not found." }, { status: 404 });
  return new Response(Buffer.from(storedImage.base64Data, "base64"), {
    headers: {
      "content-type": storedImage.contentType,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCommerce(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: rawId } = await context.params;
  const id = imageId(rawId);
  if (!id) return Response.json({ error: "Invalid image id." }, { status: 400 });
  return (await deleteCommerceProductImage(id))
    ? Response.json({ imageId: id })
    : Response.json({ error: "Image not found." }, { status: 404 });
}
