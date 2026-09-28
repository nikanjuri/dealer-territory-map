import { after } from "next/server";
import { getAppSession } from "@/lib/authorization";
import {
  canManageCommerce,
  canUseRetailShop,
} from "@/lib/access-contract";
import { placeCommerceOrderSchema } from "@/lib/commerce-contract";
import {
  listCommerceOrders,
  placeCommerceOrder,
} from "@/lib/commerce-records";
import { sendCommerceOrderNotification } from "@/lib/order-notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageCommerce(session) && !canUseRetailShop(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return Response.json({
    orders: await listCommerceOrders(
      canUseRetailShop(session) && !canManageCommerce(session)
        ? session.dealerId
        : null,
    ),
  });
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!canUseRetailShop(session) || !session.dealerId) {
    return Response.json(
      { error: "Only a linked retailer account can place an order." },
      { status: 403 },
    );
  }
  const parsed = placeCommerceOrderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid order." },
      { status: 400 },
    );
  }
  try {
    const { orderId, created } = await placeCommerceOrder({
      dealerId: session.dealerId,
      userId: session.userId,
      requestKey: parsed.data.requestKey,
      notes: parsed.data.notes,
      items: parsed.data.items,
    });
    if (created) {
      after(async () => {
        await sendCommerceOrderNotification(orderId, "placed").catch(() => undefined);
      });
    }
    return Response.json({ orderId, notification: created ? "queued" : "already queued" }, { status: created ? 201 : 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "The order could not be placed." },
      { status: 409 },
    );
  }
}
