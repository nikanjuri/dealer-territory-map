import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appUserRoles,
  appUsers,
  commerceCategories,
  commerceOrderItems,
  commerceOrders,
  commerceProductImages,
  commerceProducts,
  commerceProductVariants,
  dealers,
  retailerAccounts,
  salespeople,
} from "@/db/schema";
import type {
  CommerceOrder,
  CommerceOrderStatus,
  CommerceProduct,
  CommerceProductInput,
} from "@/lib/commerce-contract";

export async function listCommerceProducts(includeInactive = false) {
  const database = getDb();
  const [products, categories] = await Promise.all([
    database
    .select()
    .from(commerceProducts)
    .where(includeInactive ? undefined : eq(commerceProducts.active, true))
    .orderBy(commerceProducts.name),
    database.select().from(commerceCategories).orderBy(commerceCategories.name),
  ]);
  if (!products.length) return [];

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const [variants, storedImages] = await Promise.all([
    database
      .select()
      .from(commerceProductVariants)
      .where(
        and(
          inArray(
            commerceProductVariants.productId,
            products.map(({ id }) => id),
          ),
          includeInactive
            ? undefined
            : eq(commerceProductVariants.active, true),
        ),
      )
      .orderBy(commerceProductVariants.id),
    database
      .select({ id: commerceProductImages.id, productId: commerceProductImages.productId })
      .from(commerceProductImages)
      .where(
        inArray(
          commerceProductImages.productId,
          products.map(({ id }) => id),
        ),
      )
      .orderBy(commerceProductImages.position, commerceProductImages.id),
  ]);

  const variantsByProduct = new Map<number, typeof variants>();
  for (const variant of variants) {
    variantsByProduct.set(variant.productId, [
      ...(variantsByProduct.get(variant.productId) ?? []),
      variant,
    ]);
  }
  const imagesByProduct = new Map<number, string[]>();
  for (const storedImage of storedImages) {
    imagesByProduct.set(storedImage.productId, [
      ...(imagesByProduct.get(storedImage.productId) ?? []),
      `/api/commerce/product-images/${storedImage.id}`,
    ]);
  }

  return products.map(
    (product): CommerceProduct => ({
      id: product.id,
      name: product.name,
      description: product.description,
      fabricType:
        (product.fabricTypeId
          ? categoryById.get(product.fabricTypeId)?.name
          : null) ?? product.fabricType,
      design:
        (product.designId ? categoryById.get(product.designId)?.name : null) ??
        product.design,
      imageUrl:
        imagesByProduct.get(product.id)?.[0] ??
        product.imageUrls[0] ??
        product.imageUrl,
      fabricTypeId: product.fabricTypeId,
      designId: product.designId,
      imageUrls: Array.from(
        new Set([
          ...(imagesByProduct.get(product.id) ?? []),
          ...product.imageUrls,
          ...(product.imageUrl ? [product.imageUrl] : []),
        ]),
      ),
      active: product.active,
      variants: (variantsByProduct.get(product.id) ?? []).map((variant) => ({
        id: variant.id,
        color: variant.color,
        sku: variant.sku,
        pricePaise: variant.pricePaise,
        minimumOrderQuantity: variant.minimumOrderQuantity,
        stockStatus: variant.stockStatus,
        active: variant.active,
      })),
    }),
  );
}

export async function saveCommerceProduct(
  input: CommerceProductInput,
  productId?: number,
) {
  const database = getDb();
  async function resolveCategory(
    id: number | null | undefined,
    name: string | undefined,
    type: "fabric_type" | "design",
  ) {
    if (id) return id;
    const normalizedName = name?.trim();
    if (!normalizedName) return null;
    const [category] = await database
      .insert(commerceCategories)
      .values({ name: normalizedName, type })
      .onConflictDoUpdate({
        target: [commerceCategories.type, commerceCategories.name],
        set: { active: true },
      })
      .returning({ id: commerceCategories.id });
    return category?.id ?? null;
  }
  const fabricTypeId = await resolveCategory(
    input.fabricTypeId,
    input.fabricType,
    "fabric_type",
  );
  const designId = await resolveCategory(input.designId, input.design, "design");
  const selectedCategoryIds = [fabricTypeId, designId].filter(
    (value): value is number => Boolean(value),
  );
  const selectedCategories = selectedCategoryIds.length
    ? await database
        .select()
        .from(commerceCategories)
        .where(inArray(commerceCategories.id, selectedCategoryIds))
    : [];
  const categoryById = new Map(
    selectedCategories.map((category) => [category.id, category]),
  );
  const fabricTypeCategory = fabricTypeId
    ? categoryById.get(fabricTypeId)
    : null;
  const designCategory = designId
    ? categoryById.get(designId)
    : null;
  if (fabricTypeCategory && fabricTypeCategory.type !== "fabric_type") {
    throw new Error("Choose a valid fabric type category.");
  }
  if (designCategory && designCategory.type !== "design") {
    throw new Error("Choose a valid design category.");
  }
  const fabricType = (fabricTypeCategory?.name ?? input.fabricType) || null;
  const design = (designCategory?.name ?? input.design) || null;
  const imageUrls = Array.from(
    new Set(
      [...input.imageUrls, input.imageUrl || ""]
        .filter(Boolean)
        .filter((url) => !url.startsWith("/api/commerce/product-images/")),
    ),
  );
  const normalizedSkus = input.variants.map((variant) => variant.sku.toUpperCase());
  const skuMatches = await database
    .select({ productId: commerceProductVariants.productId })
    .from(commerceProductVariants)
    .where(inArray(commerceProductVariants.sku, normalizedSkus));
  if (skuMatches.some((match) => match.productId !== productId)) {
    throw new Error("Each variant SKU must be unique.");
  }
  const variants = JSON.stringify(
    input.variants.map((variant) => ({
      color: variant.color,
      sku: variant.sku.toUpperCase(),
      price_paise: variant.pricePaise,
      minimum_order_quantity: variant.minimumOrderQuantity,
      stock_status: variant.stockStatus,
    })),
  );

  if (!productId) {
    const rows = await database.$client`
      WITH inserted_product AS (
        INSERT INTO commerce_products (
          name, description, fabric_type, design, image_url,
          fabric_type_id, design_id, image_urls, active
        ) VALUES (
          ${input.name}, ${input.description || null}, ${fabricType},
          ${design}, ${imageUrls[0] || null}, ${fabricTypeId},
          ${designId}, ${JSON.stringify(imageUrls)}::jsonb,
          ${input.active}
        )
        RETURNING id
      ), inserted_variants AS (
        INSERT INTO commerce_product_variants (
          product_id, color, sku, price_paise, minimum_order_quantity, stock_status
        )
        SELECT
          inserted_product.id, variant.color, variant.sku, variant.price_paise,
          variant.minimum_order_quantity,
          variant.stock_status::commerce_stock_status
        FROM inserted_product
        CROSS JOIN jsonb_to_recordset(${variants}::jsonb) AS variant(
          color text,
          sku text,
          price_paise integer,
          minimum_order_quantity integer,
          stock_status text
        )
      )
      SELECT id FROM inserted_product
    `;
    return Number(rows[0]?.id);
  }

  const rows = await database.$client`
    WITH updated_product AS (
      UPDATE commerce_products
      SET
        name = ${input.name},
        description = ${input.description || null},
        fabric_type = ${fabricType},
        design = ${design},
        image_url = ${imageUrls[0] || null},
        fabric_type_id = ${fabricTypeId},
        design_id = ${designId},
        image_urls = ${JSON.stringify(imageUrls)}::jsonb,
        active = ${input.active},
        updated_at = now()
      WHERE id = ${productId}
      RETURNING id
    ), incoming AS (
      SELECT * FROM jsonb_to_recordset(${variants}::jsonb) AS variant(
        color text,
        sku text,
        price_paise integer,
        minimum_order_quantity integer,
        stock_status text
      )
    ), upserted AS (
      INSERT INTO commerce_product_variants (
        product_id, color, sku, price_paise, minimum_order_quantity, stock_status, active
      )
      SELECT
        updated_product.id, incoming.color, incoming.sku, incoming.price_paise,
        incoming.minimum_order_quantity,
        incoming.stock_status::commerce_stock_status,
        true
      FROM updated_product
      CROSS JOIN incoming
      ON CONFLICT (sku) DO UPDATE SET
        color = excluded.color,
        price_paise = excluded.price_paise,
        minimum_order_quantity = excluded.minimum_order_quantity,
        stock_status = excluded.stock_status,
        active = true,
        updated_at = now()
      WHERE commerce_product_variants.product_id = excluded.product_id
      RETURNING id
    ), deactivated AS (
      UPDATE commerce_product_variants
      SET active = false, updated_at = now()
      WHERE product_id = ${productId}
        AND id NOT IN (SELECT id FROM upserted)
    )
    SELECT id FROM updated_product
  `;
  return rows[0] ? Number(rows[0].id) : null;
}

export async function listCommerceCategories(includeInactive = false) {
  return getDb()
    .select()
    .from(commerceCategories)
    .where(includeInactive ? undefined : eq(commerceCategories.active, true))
    .orderBy(commerceCategories.type, commerceCategories.name);
}

export async function storeCommerceProductImage({
  productId,
  fileName,
  contentType,
  base64Data,
  sourceUrl,
}: {
  productId: number;
  fileName?: string | null;
  contentType: string;
  base64Data: string;
  sourceUrl?: string | null;
}) {
  const [image] = await getDb()
    .insert(commerceProductImages)
    .values({ productId, fileName, contentType, base64Data, sourceUrl })
    .onConflictDoNothing()
    .returning({ id: commerceProductImages.id });
  return image?.id ?? null;
}

export async function getCommerceProductImage(imageId: number) {
  const [image] = await getDb()
    .select()
    .from(commerceProductImages)
    .where(eq(commerceProductImages.id, imageId))
    .limit(1);
  return image ?? null;
}

export async function deleteCommerceProductImage(imageId: number) {
  const [image] = await getDb()
    .delete(commerceProductImages)
    .where(eq(commerceProductImages.id, imageId))
    .returning({ id: commerceProductImages.id });
  return Boolean(image);
}

export async function listCommerceOrders(dealerId?: number | null) {
  const database = getDb();
  const orderRows = await database
    .select({ order: commerceOrders, dealer: dealers })
    .from(commerceOrders)
    .leftJoin(dealers, eq(commerceOrders.dealerId, dealers.id))
    .where(dealerId ? eq(commerceOrders.dealerId, dealerId) : undefined)
    .orderBy(desc(commerceOrders.createdAt));
  if (!orderRows.length) return [];

  const itemRows = await database
    .select({
      item: commerceOrderItems,
      variant: commerceProductVariants,
      product: commerceProducts,
    })
    .from(commerceOrderItems)
    .innerJoin(
      commerceProductVariants,
      eq(commerceOrderItems.variantId, commerceProductVariants.id),
    )
    .innerJoin(
      commerceProducts,
      eq(commerceProductVariants.productId, commerceProducts.id),
    )
    .where(
      inArray(
        commerceOrderItems.orderId,
        orderRows.map(({ order }) => order.id),
      ),
    )
    .orderBy(commerceOrderItems.id);
  const itemsByOrder = new Map<number, typeof itemRows>();
  for (const row of itemRows) {
    itemsByOrder.set(row.item.orderId, [
      ...(itemsByOrder.get(row.item.orderId) ?? []),
      row,
    ]);
  }

  return orderRows.map(
    ({ order, dealer }): CommerceOrder => ({
      id: order.id,
      dealerId: order.dealerId,
      dealer:
        dealer?.name ??
        order.retailerShopName ??
        order.retailerName ??
        "Legacy retailer",
      status: order.status,
      totalPaise: order.totalPaise,
      notes: order.notes,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      legacySupabaseId: order.legacySupabaseId,
      items: (itemsByOrder.get(order.id) ?? []).map(({ item, variant, product }) => ({
        id: item.id,
        variantId: item.variantId,
        product: product.name,
        color: variant.color,
        sku: variant.sku,
        quantity: item.quantity,
        unitPricePaise: item.unitPricePaise,
      })),
    }),
  );
}

export async function placeCommerceOrder({
  dealerId,
  userId,
  requestKey,
  notes,
  items,
}: {
  dealerId: number;
  userId: string;
  requestKey: string;
  notes?: string;
  items: Array<{ variantId: number; quantity: number }>;
}) {
  const requestedByVariant = new Map<number, number>();
  for (const item of items) {
    requestedByVariant.set(
      item.variantId,
      (requestedByVariant.get(item.variantId) ?? 0) + item.quantity,
    );
  }
  const { createHash } = await import("node:crypto");
  const requestPayloadHash = createHash("sha256")
    .update(JSON.stringify({
      notes: notes?.trim() ?? "",
      items: [...requestedByVariant].sort((a, b) => a[0] - b[0]),
    }))
    .digest("hex");
  const database = getDb();
  const [existingOrder] = await database.select({
    id: commerceOrders.id,
    dealerId: commerceOrders.dealerId,
    userId: commerceOrders.placedByUserId,
    requestPayloadHash: commerceOrders.requestPayloadHash,
  }).from(commerceOrders).where(eq(commerceOrders.requestKey, requestKey)).limit(1);
  if (existingOrder) {
    if (existingOrder.dealerId !== dealerId || existingOrder.userId !== userId ||
        existingOrder.requestPayloadHash !== requestPayloadHash) {
      throw new Error("This order request was already used for different items.");
    }
    return { orderId: existingOrder.id, created: false };
  }
  const rows = await database
    .select({ variant: commerceProductVariants, product: commerceProducts })
    .from(commerceProductVariants)
    .innerJoin(
      commerceProducts,
      eq(commerceProductVariants.productId, commerceProducts.id),
    )
    .where(
      inArray(
        commerceProductVariants.id,
        Array.from(requestedByVariant.keys()),
      ),
    );
  if (rows.length !== requestedByVariant.size) {
    throw new Error("One or more selected product variants no longer exist.");
  }

  const pricedItems = rows.map(({ variant, product }) => {
    const quantity = requestedByVariant.get(variant.id) ?? 0;
    if (!product.active || !variant.active || variant.stockStatus === "out_of_stock") {
      throw new Error(`${product.name} · ${variant.color} is not available.`);
    }
    if (quantity < variant.minimumOrderQuantity) {
      throw new Error(
        `${product.name} · ${variant.color} has a minimum order of ${variant.minimumOrderQuantity}.`,
      );
    }
    return {
      variant_id: variant.id,
      quantity,
      unit_price_paise: variant.pricePaise,
    };
  });
  const totalPaise = pricedItems.reduce(
    (sum, item) => sum + item.unit_price_paise * item.quantity,
    0,
  );
  const itemJson = JSON.stringify(pricedItems);

  const inserted = await database.$client`
    WITH inserted_order AS (
      INSERT INTO commerce_orders (
        dealer_id, placed_by_user_id, retailer_name, retailer_shop_name,
        retailer_phone, total_paise, notes, request_key, request_payload_hash
      ) VALUES (
        ${dealerId}, ${userId},
        (SELECT contact_name FROM retailer_accounts WHERE auth_user_id = ${userId}),
        (SELECT shop_name FROM retailer_accounts WHERE auth_user_id = ${userId}),
        (SELECT phone FROM retailer_accounts WHERE auth_user_id = ${userId}),
        ${totalPaise}, ${notes || null}, ${requestKey}, ${requestPayloadHash}
      )
      ON CONFLICT (request_key) DO NOTHING
      RETURNING id
    ), inserted_items AS (
      INSERT INTO commerce_order_items (
        order_id, variant_id, quantity, unit_price_paise
      )
      SELECT
        inserted_order.id, item.variant_id, item.quantity, item.unit_price_paise
      FROM inserted_order
      CROSS JOIN jsonb_to_recordset(${itemJson}::jsonb) AS item(
        variant_id integer,
        quantity integer,
        unit_price_paise integer
      )
    )
    SELECT id FROM inserted_order
  `;
  const insertedId = Number(inserted[0]?.id);
  if (Number.isInteger(insertedId) && insertedId > 0) {
    return { orderId: insertedId, created: true };
  }
  const [concurrentOrder] = await database.select({
    id: commerceOrders.id,
    dealerId: commerceOrders.dealerId,
    userId: commerceOrders.placedByUserId,
    requestPayloadHash: commerceOrders.requestPayloadHash,
  }).from(commerceOrders).where(eq(commerceOrders.requestKey, requestKey)).limit(1);
  if (!concurrentOrder || concurrentOrder.dealerId !== dealerId ||
      concurrentOrder.userId !== userId || concurrentOrder.requestPayloadHash !== requestPayloadHash) {
    throw new Error("This order request could not be reconciled. Refresh your order history.");
  }
  return { orderId: concurrentOrder.id, created: false };
}

export async function updateCommerceOrderStatus(
  orderId: number,
  status: CommerceOrderStatus,
) {
  const [updated] = await getDb()
    .update(commerceOrders)
    .set({ status, updatedAt: new Date() })
    .where(eq(commerceOrders.id, orderId))
    .returning({ id: commerceOrders.id });
  return Boolean(updated);
}

export async function listCommerceAccounts() {
  const database = getDb();
  const [accounts, roleRows, retailerRows] = await Promise.all([
    database
      .select({ account: appUsers, salesperson: salespeople })
      .from(appUsers)
      .leftJoin(salespeople, eq(appUsers.salespersonId, salespeople.id))
      .orderBy(appUsers.displayName),
    database.select().from(appUserRoles),
    database
      .select({ link: retailerAccounts, dealer: dealers })
      .from(retailerAccounts)
      .innerJoin(dealers, eq(retailerAccounts.dealerId, dealers.id)),
  ]);
  const rolesByUser = new Map<string, string[]>();
  for (const row of roleRows) {
    rolesByUser.set(row.authUserId, [
      ...(rolesByUser.get(row.authUserId) ?? []),
      row.role,
    ]);
  }
  const retailerByUser = new Map(
    retailerRows.map(({ link, dealer }) => [
      link.authUserId,
      {
        dealerId: dealer.id,
        dealer: dealer.name,
        phone: link.phone,
        shopName: link.shopName,
      },
    ]),
  );
  return accounts.map(({ account, salesperson }) => {
    const retailer = retailerByUser.get(account.authUserId);
    return {
      authUserId: account.authUserId,
      username: account.username,
      displayName: account.displayName,
      active: account.active,
      roles: Array.from(
        new Set([account.role, ...(rolesByUser.get(account.authUserId) ?? [])]),
      ),
      salespersonId: account.salespersonId,
      salesperson: salesperson?.displayName ?? null,
      dealerId: retailer?.dealerId ?? null,
      dealer: retailer?.dealer ?? null,
      phone: retailer?.phone ?? null,
      shopName: retailer?.shopName ?? null,
    };
  });
}

export async function getCommerceStats() {
  const rows = await getDb().$client`
    SELECT
      count(*) FILTER (
        WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
          AT TIME ZONE 'Asia/Kolkata'
      )::integer AS orders_today,
      count(*) FILTER (WHERE status = 'pending')::integer AS pending_orders,
      coalesce(sum(total_paise) FILTER (
        WHERE status <> 'cancelled'
          AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata')
            AT TIME ZONE 'Asia/Kolkata'
      ), 0)::bigint AS revenue_today_paise,
      coalesce(sum(total_paise) FILTER (WHERE status <> 'cancelled'), 0)::bigint
        AS revenue_all_time_paise
    FROM commerce_orders
  `;
  const row = rows[0];
  return {
    ordersToday: Number(row?.orders_today ?? 0),
    pendingOrders: Number(row?.pending_orders ?? 0),
    revenueTodayPaise: Number(row?.revenue_today_paise ?? 0),
    revenueAllTimePaise: Number(row?.revenue_all_time_paise ?? 0),
  };
}

export async function listCommerceDealerOptions() {
  return getDb()
    .select({ id: dealers.id, name: dealers.name, pincode: dealers.pincode })
    .from(dealers)
    .orderBy(dealers.name);
}
