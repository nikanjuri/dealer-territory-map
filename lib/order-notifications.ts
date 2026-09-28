import "server-only";

import { getDb } from "@/db";
import type { CommerceOrderStatus } from "@/lib/commerce-contract";

type NotificationResult =
  | { delivered: true }
  | { delivered: false; reason: "not_configured" | "no_phone" };

export async function sendCommerceOrderNotification(
  orderId: number,
  event: "placed" | CommerceOrderStatus,
): Promise<NotificationResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) {
    return { delivered: false, reason: "not_configured" };
  }

  const rows = await getDb().$client`
    SELECT
      o.id,
      o.status,
      o.total_paise,
      coalesce(o.retailer_name, ra.contact_name, au.display_name, d.name) AS name,
      coalesce(o.retailer_phone, ra.phone) AS phone,
      coalesce(
        string_agg(
          p.name || ' (' || v.color || ') × ' || oi.quantity::text,
          ', ' ORDER BY oi.id
        ),
        'Order items'
      ) AS summary
    FROM commerce_orders o
    LEFT JOIN app_users au ON au.auth_user_id = o.placed_by_user_id
    LEFT JOIN retailer_accounts ra ON ra.auth_user_id = o.placed_by_user_id
    LEFT JOIN dealers d ON d.id = o.dealer_id
    LEFT JOIN commerce_order_items oi ON oi.order_id = o.id
    LEFT JOIN commerce_product_variants v ON v.id = oi.variant_id
    LEFT JOIN commerce_products p ON p.id = v.product_id
    WHERE o.id = ${orderId}
    GROUP BY o.id, ra.contact_name, ra.phone, au.display_name, d.name
  `;
  const order = rows[0];
  const phone = typeof order?.phone === "string" ? order.phone : "";
  if (!phone) return { delivered: false, reason: "no_phone" };

  const name = String(order.name || "there");
  const total = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(order.total_paise ?? 0) / 100);
  const body =
    event === "placed"
      ? `Hi ${name}, your order #${orderId} has been received.\nItems: ${String(order.summary)}\nTotal: ${total}\nWe'll update you once it's dispatched.`
      : `Hi ${name}, order #${orderId} is now ${event.replaceAll("_", " ")}.`;
  const to = phone.startsWith("whatsapp:")
    ? phone
    : `whatsapp:+${phone.replace(/^\+/, "")}`;
  const form = new URLSearchParams({ From: from, To: to, Body: body });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
    },
  );
  if (!response.ok) {
    throw new Error(`Twilio rejected the order notification (${response.status}).`);
  }
  return { delivered: true };
}
