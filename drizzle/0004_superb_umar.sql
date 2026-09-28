CREATE TYPE "public"."commerce_category_type" AS ENUM('fabric_type', 'design');--> statement-breakpoint
CREATE TABLE "commerce_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"legacy_supabase_id" text,
	"name" text NOT NULL,
	"type" "commerce_category_type" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce_legacy_retailers" (
	"legacy_supabase_id" text PRIMARY KEY NOT NULL,
	"phone" text,
	"name" text,
	"shop_name" text,
	"source_role" text DEFAULT 'retailer' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"onboarding_status" text DEFAULT 'unmatched' NOT NULL,
	"matched_auth_user_id" text,
	"matched_dealer_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commerce_orders" ALTER COLUMN "dealer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_orders" ALTER COLUMN "placed_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_order_items" ADD COLUMN "legacy_supabase_id" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "legacy_supabase_id" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "legacy_retailer_id" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "retailer_name" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "retailer_phone" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "retailer_shop_name" text;--> statement-breakpoint
ALTER TABLE "commerce_product_variants" ADD COLUMN "legacy_supabase_id" text;--> statement-breakpoint
ALTER TABLE "commerce_products" ADD COLUMN "legacy_supabase_id" text;--> statement-breakpoint
ALTER TABLE "commerce_products" ADD COLUMN "fabric_type_id" integer;--> statement-breakpoint
ALTER TABLE "commerce_products" ADD COLUMN "design_id" integer;--> statement-breakpoint
ALTER TABLE "commerce_products" ADD COLUMN "image_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "retailer_accounts" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "retailer_accounts" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "retailer_accounts" ADD COLUMN "shop_name" text;--> statement-breakpoint
ALTER TABLE "retailer_accounts" ADD COLUMN "legacy_supabase_user_id" text;--> statement-breakpoint
INSERT INTO "commerce_categories" ("name", "type")
SELECT DISTINCT "fabric_type", 'fabric_type'::"commerce_category_type"
FROM "commerce_products"
WHERE "fabric_type" IS NOT NULL AND btrim("fabric_type") <> '';--> statement-breakpoint
INSERT INTO "commerce_categories" ("name", "type")
SELECT DISTINCT "design", 'design'::"commerce_category_type"
FROM "commerce_products"
WHERE "design" IS NOT NULL AND btrim("design") <> '';--> statement-breakpoint
UPDATE "commerce_products" AS product
SET "fabric_type_id" = category."id"
FROM "commerce_categories" AS category
WHERE category."type" = 'fabric_type'
  AND category."name" = product."fabric_type";--> statement-breakpoint
UPDATE "commerce_products" AS product
SET "design_id" = category."id"
FROM "commerce_categories" AS category
WHERE category."type" = 'design'
  AND category."name" = product."design";--> statement-breakpoint
UPDATE "commerce_products"
SET "image_urls" = jsonb_build_array("image_url")
WHERE "image_url" IS NOT NULL AND btrim("image_url") <> '';--> statement-breakpoint
UPDATE "retailer_accounts" AS retailer
SET "contact_name" = account."display_name"
FROM "app_users" AS account
WHERE account."auth_user_id" = retailer."auth_user_id";--> statement-breakpoint
ALTER TABLE "commerce_legacy_retailers" ADD CONSTRAINT "commerce_legacy_retailers_matched_auth_user_id_app_users_auth_user_id_fk" FOREIGN KEY ("matched_auth_user_id") REFERENCES "public"."app_users"("auth_user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_legacy_retailers" ADD CONSTRAINT "commerce_legacy_retailers_matched_dealer_id_dealers_id_fk" FOREIGN KEY ("matched_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_categories_type_name_unique" ON "commerce_categories" USING btree ("type","name");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_categories_legacy_id_unique" ON "commerce_categories" USING btree ("legacy_supabase_id");--> statement-breakpoint
CREATE INDEX "commerce_legacy_retailers_phone_idx" ON "commerce_legacy_retailers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "commerce_legacy_retailers_match_idx" ON "commerce_legacy_retailers" USING btree ("matched_auth_user_id");--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_legacy_retailer_id_commerce_legacy_retailers_legacy_supabase_id_fk" FOREIGN KEY ("legacy_retailer_id") REFERENCES "public"."commerce_legacy_retailers"("legacy_supabase_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_products" ADD CONSTRAINT "commerce_products_fabric_type_id_commerce_categories_id_fk" FOREIGN KEY ("fabric_type_id") REFERENCES "public"."commerce_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_products" ADD CONSTRAINT "commerce_products_design_id_commerce_categories_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."commerce_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_order_items_legacy_id_unique" ON "commerce_order_items" USING btree ("legacy_supabase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_orders_legacy_id_unique" ON "commerce_orders" USING btree ("legacy_supabase_id");--> statement-breakpoint
CREATE INDEX "commerce_orders_legacy_retailer_idx" ON "commerce_orders" USING btree ("legacy_retailer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_product_variants_legacy_id_unique" ON "commerce_product_variants" USING btree ("legacy_supabase_id");--> statement-breakpoint
CREATE INDEX "commerce_products_fabric_type_idx" ON "commerce_products" USING btree ("fabric_type_id");--> statement-breakpoint
CREATE INDEX "commerce_products_design_idx" ON "commerce_products" USING btree ("design_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_products_legacy_id_unique" ON "commerce_products" USING btree ("legacy_supabase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retailer_accounts_phone_unique" ON "retailer_accounts" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "retailer_accounts_legacy_user_unique" ON "retailer_accounts" USING btree ("legacy_supabase_user_id");
