import { loadEnvConfig } from "@next/env";
import { neon } from "@neondatabase/serverless";

type SourceRow = Record<string, unknown>;

loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const sourceUrl = process.env.SUPABASE_MIGRATION_URL;
const sourceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const targetUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!sourceUrl || !sourceKey) {
  throw new Error(
    "SUPABASE_MIGRATION_URL and SUPABASE_SERVICE_ROLE_KEY are required. Use a temporary service-role key and revoke it after migration.",
  );
}
if (!targetUrl) throw new Error("DATABASE_URL_UNPOOLED is required.");
const migrationSourceUrl = sourceUrl;
const migrationSourceKey = sourceKey;

async function fetchTable(table: string) {
  const rows: SourceRow[] = [];
  for (let offset = 0; ; offset += 1_000) {
    const response = await fetch(
      `${migrationSourceUrl}/rest/v1/${table}?select=*&order=created_at.asc`,
      {
        headers: {
          apikey: migrationSourceKey,
          authorization: `Bearer ${migrationSourceKey}`,
          range: `${offset}-${offset + 999}`,
        },
      },
    );
    if (!response.ok) {
      throw new Error(
        `Supabase ${table} export failed (${response.status}): ${(await response.text()).slice(0, 300)}`,
      );
    }
    const page = (await response.json()) as SourceRow[];
    rows.push(...page);
    if (page.length < 1_000) return rows;
  }
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function bool(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function paise(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error(`Invalid currency amount: ${value}`);
  return Math.round(amount * 100);
}

const tableNames = [
  "profiles",
  "pending_retailers",
  "categories",
  "products",
  "product_variants",
  "orders",
  "order_items",
] as const;

const source = Object.fromEntries(
  await Promise.all(
    tableNames.map(async (table) => [table, await fetchTable(table)] as const),
  ),
) as Record<(typeof tableNames)[number], SourceRow[]>;

console.log(
  JSON.stringify({ mode: apply ? "apply" : "dry-run", sourceCounts: Object.fromEntries(tableNames.map((table) => [table, source[table].length])) }, null, 2),
);

if (!apply) {
  console.log("Dry run only. Re-run with --apply after reviewing the counts.");
  process.exit(0);
}

const sql = neon(targetUrl);

for (const category of source.categories) {
  await sql`
    INSERT INTO commerce_categories (
      legacy_supabase_id, name, type, active, created_at
    ) VALUES (
      ${String(category.id)}, ${String(category.name)}, ${String(category.type)}::commerce_category_type,
      ${bool(category.is_active)}, ${text(category.created_at) ?? new Date().toISOString()}
    )
    ON CONFLICT (legacy_supabase_id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      active = excluded.active
  `;
}

for (const product of source.products) {
  const fabricId = text(product.fabric_type_id)
    ? await sql`SELECT id FROM commerce_categories WHERE legacy_supabase_id = ${String(product.fabric_type_id)}`
    : [];
  const designId = text(product.design_id)
    ? await sql`SELECT id FROM commerce_categories WHERE legacy_supabase_id = ${String(product.design_id)}`
    : [];
  const images = Array.isArray(product.images)
    ? product.images.filter((value): value is string => typeof value === "string")
    : [];
  await sql`
    INSERT INTO commerce_products (
      legacy_supabase_id, name, description, fabric_type_id, design_id,
      image_url, image_urls, active, created_at, updated_at
    ) VALUES (
      ${String(product.id)}, ${String(product.name)}, ${text(product.description)},
      ${fabricId[0]?.id ? Number(fabricId[0].id) : null},
      ${designId[0]?.id ? Number(designId[0].id) : null},
      ${images[0] ?? null}, ${JSON.stringify(images)}::jsonb,
      ${bool(product.is_active)}, ${text(product.created_at) ?? new Date().toISOString()}, now()
    )
    ON CONFLICT (legacy_supabase_id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      fabric_type_id = excluded.fabric_type_id,
      design_id = excluded.design_id,
      image_url = excluded.image_url,
      image_urls = excluded.image_urls,
      active = excluded.active,
      updated_at = now()
  `;
  const targetProduct = await sql`
    SELECT id FROM commerce_products WHERE legacy_supabase_id = ${String(product.id)}
  `;
  for (const [position, imageUrl] of images.entries()) {
    const imageResponse = await fetch(imageUrl, {
      headers: {
        apikey: migrationSourceKey,
        authorization: `Bearer ${migrationSourceKey}`,
      },
    });
    if (!imageResponse.ok) {
      throw new Error(
        `Product image export failed for ${product.id} (${imageResponse.status}).`,
      );
    }
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    if (bytes.byteLength > 12 * 1024 * 1024) {
      throw new Error(`Product image exceeds 12 MB for ${product.id}.`);
    }
    await sql`
      INSERT INTO commerce_product_images (
        product_id, source_url, content_type, base64_data, position
      ) VALUES (
        ${Number(targetProduct[0].id)}, ${imageUrl},
        ${imageResponse.headers.get("content-type") ?? "application/octet-stream"},
        ${bytes.toString("base64")}, ${position}
      )
      ON CONFLICT (product_id, source_url) DO UPDATE SET
        content_type = excluded.content_type,
        base64_data = excluded.base64_data,
        position = excluded.position
    `;
  }
}

for (const variant of source.product_variants) {
  const product = await sql`SELECT id FROM commerce_products WHERE legacy_supabase_id = ${String(variant.product_id)}`;
  if (!product[0]?.id) throw new Error(`Missing product for variant ${variant.id}`);
  await sql`
    INSERT INTO commerce_product_variants (
      legacy_supabase_id, product_id, color, sku, price_paise,
      minimum_order_quantity, stock_status, active, created_at, updated_at
    ) VALUES (
      ${String(variant.id)}, ${Number(product[0].id)}, ${String(variant.color)},
      ${String(variant.sku).toUpperCase()}, ${paise(variant.price_per_unit)},
      ${Number(variant.moq ?? 1)}, ${String(variant.stock_status ?? "in_stock")}::commerce_stock_status,
      true, ${text(variant.created_at) ?? new Date().toISOString()}, now()
    )
    ON CONFLICT (legacy_supabase_id) DO UPDATE SET
      product_id = excluded.product_id,
      color = excluded.color,
      sku = excluded.sku,
      price_paise = excluded.price_paise,
      minimum_order_quantity = excluded.minimum_order_quantity,
      stock_status = excluded.stock_status,
      active = true,
      updated_at = now()
  `;
}

for (const profile of source.profiles) {
  await sql`
    INSERT INTO commerce_legacy_retailers (
      legacy_supabase_id, phone, name, shop_name, source_role, active,
      onboarding_status, created_at
    ) VALUES (
      ${String(profile.id)}, ${text(profile.phone)}, ${text(profile.name)},
      ${text(profile.shop_name)}, ${text(profile.role) ?? "retailer"},
      ${bool(profile.is_active)}, 'unmatched',
      ${text(profile.created_at) ?? new Date().toISOString()}
    )
    ON CONFLICT (legacy_supabase_id) DO UPDATE SET
      phone = excluded.phone,
      name = excluded.name,
      shop_name = excluded.shop_name,
      source_role = excluded.source_role,
      active = excluded.active
  `;
}

for (const pending of source.pending_retailers) {
  await sql`
    INSERT INTO commerce_legacy_retailers (
      legacy_supabase_id, phone, name, shop_name, source_role, active,
      onboarding_status, created_at
    ) VALUES (
      ${String(pending.id)}, ${text(pending.phone)}, ${text(pending.name)},
      ${text(pending.shop_name)}, ${text(pending.role) ?? "retailer"}, true,
      'pending_password_account', ${text(pending.created_at) ?? new Date().toISOString()}
    )
    ON CONFLICT (legacy_supabase_id) DO UPDATE SET
      phone = excluded.phone,
      name = excluded.name,
      shop_name = excluded.shop_name,
      source_role = excluded.source_role
  `;
}

await sql`
  UPDATE commerce_legacy_retailers legacy
  SET
    matched_auth_user_id = retailer.auth_user_id,
    matched_dealer_id = retailer.dealer_id,
    onboarding_status = 'matched'
  FROM retailer_accounts retailer
  WHERE legacy.phone IS NOT NULL AND retailer.phone = legacy.phone
`;

for (const order of source.orders) {
  const legacy = await sql`
    SELECT * FROM commerce_legacy_retailers
    WHERE legacy_supabase_id = ${String(order.retailer_id)}
  `;
  const retailer = legacy[0];
  await sql`
    INSERT INTO commerce_orders (
      legacy_supabase_id, dealer_id, placed_by_user_id, legacy_retailer_id,
      retailer_name, retailer_phone, retailer_shop_name, status, total_paise,
      notes, created_at, updated_at
    ) VALUES (
      ${String(order.id)}, ${retailer?.matched_dealer_id ? Number(retailer.matched_dealer_id) : null},
      ${text(retailer?.matched_auth_user_id)}, ${String(order.retailer_id)},
      ${text(retailer?.name)}, ${text(retailer?.phone)}, ${text(retailer?.shop_name)},
      ${String(order.status ?? "pending")}::commerce_order_status,
      ${paise(order.total_amount ?? 0)}, ${text(order.notes)},
      ${text(order.created_at) ?? new Date().toISOString()},
      ${text(order.updated_at) ?? text(order.created_at) ?? new Date().toISOString()}
    )
    ON CONFLICT (legacy_supabase_id) DO UPDATE SET
      dealer_id = excluded.dealer_id,
      placed_by_user_id = excluded.placed_by_user_id,
      legacy_retailer_id = excluded.legacy_retailer_id,
      retailer_name = excluded.retailer_name,
      retailer_phone = excluded.retailer_phone,
      retailer_shop_name = excluded.retailer_shop_name,
      status = excluded.status,
      total_paise = excluded.total_paise,
      notes = excluded.notes,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `;
}

for (const item of source.order_items) {
  const [order, variant] = await Promise.all([
    sql`SELECT id FROM commerce_orders WHERE legacy_supabase_id = ${String(item.order_id)}`,
    sql`SELECT id FROM commerce_product_variants WHERE legacy_supabase_id = ${String(item.variant_id)}`,
  ]);
  if (!order[0]?.id || !variant[0]?.id) {
    throw new Error(`Missing order or variant for order item ${item.id}`);
  }
  await sql`
    INSERT INTO commerce_order_items (
      legacy_supabase_id, order_id, variant_id, quantity, unit_price_paise, created_at
    ) VALUES (
      ${String(item.id)}, ${Number(order[0].id)}, ${Number(variant[0].id)},
      ${Number(item.quantity)}, ${paise(item.unit_price)},
      ${text(item.created_at) ?? new Date().toISOString()}
    )
    ON CONFLICT (legacy_supabase_id) DO UPDATE SET
      order_id = excluded.order_id,
      variant_id = excluded.variant_id,
      quantity = excluded.quantity,
      unit_price_paise = excluded.unit_price_paise
  `;
}

const targetCounts = await sql`
  SELECT
    (SELECT count(*)::integer FROM commerce_categories) AS categories,
    (SELECT count(*)::integer FROM commerce_products) AS products,
    (SELECT count(*)::integer FROM commerce_product_variants) AS product_variants,
    (SELECT count(*)::integer FROM commerce_product_images) AS product_images,
    (SELECT count(*)::integer FROM commerce_legacy_retailers) AS legacy_retailers,
    (SELECT count(*)::integer FROM commerce_orders) AS orders,
    (SELECT count(*)::integer FROM commerce_order_items) AS order_items
`;
console.log(JSON.stringify({ applied: true, targetCounts: targetCounts[0] }, null, 2));
