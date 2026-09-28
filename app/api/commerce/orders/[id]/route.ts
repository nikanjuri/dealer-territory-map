import { after } from "next/server";
import { getAppSession } from "@/lib/authorization";
import { canManageCommerce } from "@/lib/access-contract";
import { updateCommerceOrderSchema } from "@/lib/commerce-contract";
import { updateCommerceOrderStatus } from "@/lib/commerce-records";
import { sendCommerceOrderNotification } from "@/lib/order-notifications";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCommerce(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: rawId } = await context.params;
  const orderId = Number(rawId);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return Response.json({ error: "Invalid order id." }, { status: 400 });
  }
  const parsed = updateCommerceOrderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: "Invalid order status." }, { status: 400 });
  }
  const updated = await updateCommerceOrderStatus(orderId, parsed.data.status);
  if (!updated) {
    return Response.json({ error: "Order not found." }, { status: 404 });
  }
  after(async () => {
    await sendCommerceOrderNotification(orderId, parsed.data.status).catch(
      () => undefined,
    );
  });
  return Response.json({ orderId, notification: "queued" });
}
