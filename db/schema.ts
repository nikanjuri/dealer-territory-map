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

export const stateEnum = pgEnum("state", ["Telangana", "Andhra Pradesh"]);
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
export const appRoleEnum = pgEnum("app_role", ["admin", "salesperson"]);

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
  (table) => [index("route_plans_salesperson_date_idx").on(table.salespersonId, table.routeDate)],
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
