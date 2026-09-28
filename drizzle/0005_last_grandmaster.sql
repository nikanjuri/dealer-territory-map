CREATE TABLE "commerce_product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"source_url" text,
	"file_name" text,
	"content_type" text NOT NULL,
	"base64_data" text NOT NULL,
	"alt_text" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commerce_product_images" ADD CONSTRAINT "commerce_product_images_product_id_commerce_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commerce_product_images_product_idx" ON "commerce_product_images" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_product_images_source_unique" ON "commerce_product_images" USING btree ("product_id","source_url");