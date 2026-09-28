import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const stateEnum = pgEnum("state", [
  "Telangana",
  "Andhra Pradesh",
  "Karnataka",
  "Andaman and Nicobar Islands",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
]);
export const locationPrecisionEnum = pgEnum("location_precision", [
  "address",
  "pincode",
]);
export const validationStatusEnum = pgEnum("validation_status", [
  "verified",
  "review",
  "invalid",
  "unavailable",
]);
export const validationSourceEnum = pgEnum("validation_source", [
  "postal-directory",
  "manual",
]);
export const routePlanStatusEnum = pgEnum("route_plan_status", [
  "draft",
  "optimized",
  "in_progress",
  "completed",
  "cancelled",
]);
export const visitStatusEnum = pgEnum("visit_status", [
  "planned",
  "arrived",
  "completed",
  "skipped",
]);
export const appRoleEnum = pgEnum("app_role", [
  "admin",
  "salesperson",
  "operations_staff",
  "retailer",
]);
export const commerceStockStatusEnum = pgEnum("commerce_stock_status", [
  "in_stock",
  "low_stock",
  "out_of_stock",
]);
export const commerceOrderStatusEnum = pgEnum("commerce_order_status", [
  "pending",
  "confirmed",
  "dispatched",
  "delivered",
  "cancelled",
]);
export const commerceCategoryTypeEnum = pgEnum("commerce_category_type", [
  "fabric_type",
  "design",
]);

export const salespeople = pgTable(
  "salespeople",
  {
    id: serial("id").primaryKey(),
    normalizedName: text("normalized_name").notNull(),
    displayName: text("display_name").notNull(),
    color: text("color").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("salespeople_normalized_name_unique").on(table.normalizedName)],
);

export const appUsers = pgTable(
  "app_users",
  {
    authUserId: text("auth_user_id").primaryKey(),
    username: text("username").notNull(),
    authEmail: text("auth_email").notNull(),
    displayName: text("display_name").notNull(),
    role: appRoleEnum("role").notNull(),
    salespersonId: integer("salesperson_id").references(() => salespeople.id, {
      onDelete: "set null",
    }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("app_users_username_unique").on(table.username),
    uniqueIndex("app_users_auth_email_unique").on(table.authEmail),
    uniqueIndex("app_users_salesperson_unique").on(table.salespersonId),
  ],
);

export const appUserRoles = pgTable(
  "app_user_roles",
  {
    id: serial("id").primaryKey(),
    authUserId: text("auth_user_id")
      .notNull()
      .references(() => appUsers.authUserId, { onDelete: "cascade" }),
    role: appRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("app_user_roles_user_role_unique").on(
      table.authUserId,
      table.role,
    ),
    index("app_user_roles_user_idx").on(table.authUserId),
  ],
);

export const dealers = pgTable(
  "dealers",
  {
    id: serial("id").primaryKey(),
    salespersonId: integer("salesperson_id")
      .notNull()
      .references(() => salespeople.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    pincode: text("pincode").notNull(),
    area: text("area").notNull(),
    sourceArea: text("source_area"),
    address: text("address"),
    state: stateEnum("state").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    locationPrecision: locationPrecisionEnum("location_precision")
      .notNull()
      .default("pincode"),
    googlePlaceId: text("google_place_id"),
    geocodedAddress: text("geocoded_address"),
    reviewNote: text("review_note"),
    postalSuggestions: jsonb("postal_suggestions").$type<string[]>(),
    validationStatus: validationStatusEnum("validation_status")
      .notNull()
      .default("unavailable"),
    validationSource: validationSourceEnum("validation_source"),
    validationCheckedAt: timestamp("validation_checked_at", {
      withTimezone: true,
    }),
    validationDataset: text("validation_dataset"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("dealers_identity_unique").on(table.name, table.pincode),
    index("dealers_pincode_idx").on(table.pincode),
    index("dealers_salesperson_idx").on(table.salespersonId),
  ],
);

export const dealerImportReviews = pgTable(
  "dealer_import_reviews",
  {
    id: serial("id").primaryKey(),
    salespersonId: integer("salesperson_id")
      .notNull()
      .references(() => salespeople.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    pincode: text("pincode"),
    area: text("area"),
    address: text("address"),
    state: text("state"),
    reviewCategory: text("review_category").notNull(),
    reviewDetail: text("review_detail").notNull(),
    sourceFile: text("source_file").notNull(),
    sourceSheet: text("source_sheet").notNull(),
    sourceRow: integer("source_row").notNull(),
    status: text("status").notNull().default("pending"),
    resolvedDealerId: integer("resolved_dealer_id").references(
      () => dealers.id,
      { onDelete: "set null" },
    ),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("dealer_import_reviews_source_unique").on(
      table.sourceFile,
      table.sourceSheet,
      table.sourceRow,
    ),
    index("dealer_import_reviews_status_idx").on(table.status),
    index("dealer_import_reviews_salesperson_idx").on(table.salespersonId),
  ],
);

export const retailerAccounts = pgTable(
  "retailer_accounts",
  {
    authUserId: text("auth_user_id")
      .primaryKey()
      .references(() => appUsers.authUserId, { onDelete: "cascade" }),
    dealerId: integer("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "restrict" }),
    phone: text("phone"),
    contactName: text("contact_name"),
    shopName: text("shop_name"),
    legacySupabaseUserId: text("legacy_supabase_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("retailer_accounts_dealer_idx").on(table.dealerId),
    uniqueIndex("retailer_accounts_phone_unique").on(table.phone),
    uniqueIndex("retailer_accounts_legacy_user_unique").on(
      table.legacySupabaseUserId,
    ),
  ],
);

export const commerceCategories = pgTable(
  "commerce_categories",
  {
    id: serial("id").primaryKey(),
    legacySupabaseId: text("legacy_supabase_id"),
    name: text("name").notNull(),
    type: commerceCategoryTypeEnum("type").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("commerce_categories_type_name_unique").on(
      table.type,
      table.name,
    ),
    uniqueIndex("commerce_categories_legacy_id_unique").on(
      table.legacySupabaseId,
    ),
  ],
);

export const commerceProducts = pgTable(
  "commerce_products",
  {
    id: serial("id").primaryKey(),
    legacySupabaseId: text("legacy_supabase_id"),
    name: text("name").notNull(),
    description: text("description"),
    fabricType: text("fabric_type"),
    design: text("design"),
    imageUrl: text("image_url"),
    fabricTypeId: integer("fabric_type_id").references(
      () => commerceCategories.id,
      { onDelete: "set null" },
    ),
    designId: integer("design_id").references(() => commerceCategories.id, {
      onDelete: "set null",
    }),
    imageUrls: jsonb("image_urls").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("commerce_products_active_idx").on(table.active),
    index("commerce_products_fabric_type_idx").on(table.fabricTypeId),
    index("commerce_products_design_idx").on(table.designId),
    uniqueIndex("commerce_products_legacy_id_unique").on(
      table.legacySupabaseId,
    ),
  ],
);

export const commerceProductVariants = pgTable(
  "commerce_product_variants",
  {
    id: serial("id").primaryKey(),
    legacySupabaseId: text("legacy_supabase_id"),
    productId: integer("product_id")
      .notNull()
      .references(() => commerceProducts.id, { onDelete: "cascade" }),
    color: text("color").notNull(),
    sku: text("sku").notNull(),
    pricePaise: integer("price_paise").notNull(),
    minimumOrderQuantity: integer("minimum_order_quantity").notNull().default(1),
    stockStatus: commerceStockStatusEnum("stock_status")
      .notNull()
      .default("in_stock"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("commerce_product_variants_sku_unique").on(table.sku),
    uniqueIndex("commerce_product_variants_legacy_id_unique").on(
      table.legacySupabaseId,
    ),
    index("commerce_product_variants_product_idx").on(table.productId),
  ],
);

export const commerceProductImages = pgTable(
  "commerce_product_images",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => commerceProducts.id, { onDelete: "cascade" }),
    sourceUrl: text("source_url"),
    fileName: text("file_name"),
    contentType: text("content_type").notNull(),
    base64Data: text("base64_data").notNull(),
    altText: text("alt_text"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("commerce_product_images_product_idx").on(table.productId),
    uniqueIndex("commerce_product_images_source_unique").on(
      table.productId,
      table.sourceUrl,
    ),
  ],
);

export const commerceLegacyRetailers = pgTable(
  "commerce_legacy_retailers",
  {
    legacySupabaseId: text("legacy_supabase_id").primaryKey(),
    phone: text("phone"),
    name: text("name"),
    shopName: text("shop_name"),
    sourceRole: text("source_role").notNull().default("retailer"),
    active: boolean("active").notNull().default(true),
    onboardingStatus: text("onboarding_status").notNull().default("unmatched"),
    matchedAuthUserId: text("matched_auth_user_id").references(
      () => appUsers.authUserId,
      { onDelete: "set null" },
    ),
    matchedDealerId: integer("matched_dealer_id").references(() => dealers.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("commerce_legacy_retailers_phone_idx").on(table.phone),
    index("commerce_legacy_retailers_match_idx").on(table.matchedAuthUserId),
  ],
);

export const commerceOrders = pgTable(
  "commerce_orders",
  {
    id: serial("id").primaryKey(),
    requestKey: text("request_key"),
    requestPayloadHash: text("request_payload_hash"),
    legacySupabaseId: text("legacy_supabase_id"),
    dealerId: integer("dealer_id")
      .references(() => dealers.id, { onDelete: "restrict" }),
    placedByUserId: text("placed_by_user_id")
      .references(() => appUsers.authUserId, { onDelete: "restrict" }),
    legacyRetailerId: text("legacy_retailer_id").references(
      () => commerceLegacyRetailers.legacySupabaseId,
      { onDelete: "set null" },
    ),
    retailerName: text("retailer_name"),
    retailerPhone: text("retailer_phone"),
    retailerShopName: text("retailer_shop_name"),
    status: commerceOrderStatusEnum("status").notNull().default("pending"),
    totalPaise: integer("total_paise").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("commerce_orders_dealer_idx").on(table.dealerId),
    index("commerce_orders_status_idx").on(table.status),
    index("commerce_orders_created_idx").on(table.createdAt),
    uniqueIndex("commerce_orders_legacy_id_unique").on(
      table.legacySupabaseId,
    ),
    uniqueIndex("commerce_orders_request_key_unique").on(table.requestKey),
    index("commerce_orders_legacy_retailer_idx").on(table.legacyRetailerId),
  ],
);

export const commerceOrderItems = pgTable(
  "commerce_order_items",
  {
    id: serial("id").primaryKey(),
    legacySupabaseId: text("legacy_supabase_id"),
    orderId: integer("order_id")
      .notNull()
      .references(() => commerceOrders.id, { onDelete: "cascade" }),
    variantId: integer("variant_id")
      .notNull()
      .references(() => commerceProductVariants.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("commerce_order_items_order_idx").on(table.orderId),
    uniqueIndex("commerce_order_items_legacy_id_unique").on(
      table.legacySupabaseId,
    ),
  ],
);

export const territoryAssignments = pgTable(
  "territory_assignments",
  {
    id: serial("id").primaryKey(),
    pincode: text("pincode").notNull(),
    state: stateEnum("state").notNull(),
    salespersonId: integer("salesperson_id")
      .notNull()
      .references(() => salespeople.id, { onDelete: "restrict" }),
    boundaryGeojson: jsonb("boundary_geojson").$type<Record<string, unknown>>(),
    source: text("source").notNull().default("postal-boundary"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: text("approved_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("territory_assignments_pincode_unique").on(table.pincode)],
);

export const visitRules = pgTable("visit_rules", {
  id: serial("id").primaryKey(),
  dealerId: integer("dealer_id")
    .notNull()
    .references(() => dealers.id, { onDelete: "cascade" })
    .unique(),
  frequencyDays: integer("frequency_days").notNull().default(30),
  serviceMinutes: integer("service_minutes").notNull().default(30),
  priority: integer("priority").notNull().default(3),
  nextDueAt: date("next_due_at"),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const routePlans = pgTable(
  "route_plans",
  {
    id: serial("id").primaryKey(),
    previewKey: text("preview_key"),
    salespersonId: integer("salesperson_id")
      .notNull()
      .references(() => salespeople.id, { onDelete: "restrict" }),
    routeDate: date("route_date").notNull(),
    status: routePlanStatusEnum("status").notNull().default("draft"),
    startLatitude: doublePrecision("start_latitude"),
    startLongitude: doublePrecision("start_longitude"),
    endLatitude: doublePrecision("end_latitude"),
    endLongitude: doublePrecision("end_longitude"),
    workdayStart: timestamp("workday_start", { withTimezone: true }),
    workdayEnd: timestamp("workday_end", { withTimezone: true }),
    optimizationProvider: text("optimization_provider"),
    optimizationSummary: jsonb("optimization_summary").$type<Record<string, unknown>>(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("route_plans_salesperson_date_idx").on(table.salespersonId, table.routeDate),
    uniqueIndex("route_plans_preview_key_unique").on(table.previewKey),
  ],
);

export const routeStops = pgTable(
  "route_stops",
  {
    id: serial("id").primaryKey(),
    routePlanId: integer("route_plan_id")
      .notNull()
      .references(() => routePlans.id, { onDelete: "cascade" }),
    dealerId: integer("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    plannedArrivalAt: timestamp("planned_arrival_at", { withTimezone: true }),
    plannedDepartureAt: timestamp("planned_departure_at", { withTimezone: true }),
    travelSeconds: integer("travel_seconds"),
    travelMeters: integer("travel_meters"),
    status: visitStatusEnum("status").notNull().default("planned"),
  },
  (table) => [uniqueIndex("route_stops_plan_sequence_unique").on(table.routePlanId, table.sequence)],
);

export const visits = pgTable(
  "visits",
  {
    id: serial("id").primaryKey(),
    dealerId: integer("dealer_id")
      .notNull()
      .references(() => dealers.id, { onDelete: "restrict" }),
    routeStopId: integer("route_stop_id").references(() => routeStops.id, {
      onDelete: "set null",
    }),
    salespersonId: integer("salesperson_id")
      .notNull()
      .references(() => salespeople.id, { onDelete: "restrict" }),
    userId: text("user_id").notNull(),
    status: visitStatusEnum("status").notNull().default("planned"),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    checkInLatitude: doublePrecision("check_in_latitude"),
    checkInLongitude: doublePrecision("check_in_longitude"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("visits_dealer_completed_idx").on(table.dealerId, table.completedAt)],
);
