ALTER TABLE "commerce_orders" ADD COLUMN "request_key" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "request_payload_hash" text;--> statement-breakpoint
ALTER TABLE "route_plans" ADD COLUMN "preview_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_orders_request_key_unique" ON "commerce_orders" USING btree ("request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "route_plans_preview_key_unique" ON "route_plans" USING btree ("preview_key");