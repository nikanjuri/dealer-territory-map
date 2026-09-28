CREATE TYPE "public"."commerce_order_status" AS ENUM('pending', 'confirmed', 'dispatched', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."commerce_stock_status" AS ENUM('in_stock', 'low_stock', 'out_of_stock');--> statement-breakpoint
ALTER TYPE "public"."app_role" ADD VALUE 'operations_staff';--> statement-breakpoint
ALTER TYPE "public"."app_role" ADD VALUE 'retailer';--> statement-breakpoint
CREATE TABLE "app_user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_user_id" text NOT NULL,
	"role" "app_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "app_user_roles" ("auth_user_id", "role")
SELECT "auth_user_id", "role" FROM "app_users"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TABLE "commerce_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"variant_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"dealer_id" integer NOT NULL,
	"placed_by_user_id" text NOT NULL,
	"status" "commerce_order_status" DEFAULT 'pending' NOT NULL,
	"total_paise" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce_product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"color" text NOT NULL,
	"sku" text NOT NULL,
	"price_paise" integer NOT NULL,
	"minimum_order_quantity" integer DEFAULT 1 NOT NULL,
	"stock_status" "commerce_stock_status" DEFAULT 'in_stock' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"fabric_type" text,
	"design" text,
	"image_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retailer_accounts" (
	"auth_user_id" text PRIMARY KEY NOT NULL,
	"dealer_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_user_roles" ADD CONSTRAINT "app_user_roles_auth_user_id_app_users_auth_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."app_users"("auth_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_items" ADD CONSTRAINT "commerce_order_items_order_id_commerce_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commerce_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_items" ADD CONSTRAINT "commerce_order_items_variant_id_commerce_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."commerce_product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_placed_by_user_id_app_users_auth_user_id_fk" FOREIGN KEY ("placed_by_user_id") REFERENCES "public"."app_users"("auth_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_product_variants" ADD CONSTRAINT "commerce_product_variants_product_id_commerce_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retailer_accounts" ADD CONSTRAINT "retailer_accounts_auth_user_id_app_users_auth_user_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "public"."app_users"("auth_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retailer_accounts" ADD CONSTRAINT "retailer_accounts_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_roles_user_role_unique" ON "app_user_roles" USING btree ("auth_user_id","role");--> statement-breakpoint
CREATE INDEX "app_user_roles_user_idx" ON "app_user_roles" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "commerce_order_items_order_idx" ON "commerce_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "commerce_orders_dealer_idx" ON "commerce_orders" USING btree ("dealer_id");--> statement-breakpoint
CREATE INDEX "commerce_orders_status_idx" ON "commerce_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "commerce_orders_created_idx" ON "commerce_orders" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_product_variants_sku_unique" ON "commerce_product_variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "commerce_product_variants_product_idx" ON "commerce_product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "commerce_products_active_idx" ON "commerce_products" USING btree ("active");--> statement-breakpoint
CREATE INDEX "retailer_accounts_dealer_idx" ON "retailer_accounts" USING btree ("dealer_id");
