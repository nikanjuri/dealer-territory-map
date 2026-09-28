ALTER TYPE "public"."state" ADD VALUE 'Karnataka';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Andaman and Nicobar Islands';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Arunachal Pradesh';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Assam';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Bihar';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Chandigarh';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Chhattisgarh';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Dadra and Nagar Haveli and Daman and Diu';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Delhi';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Goa';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Gujarat';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Haryana';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Himachal Pradesh';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Jammu and Kashmir';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Jharkhand';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Kerala';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Ladakh';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Lakshadweep';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Madhya Pradesh';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Maharashtra';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Manipur';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Meghalaya';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Mizoram';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Nagaland';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Odisha';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Puducherry';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Punjab';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Rajasthan';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Sikkim';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Tamil Nadu';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Tripura';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Uttar Pradesh';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'Uttarakhand';--> statement-breakpoint
ALTER TYPE "public"."state" ADD VALUE 'West Bengal';--> statement-breakpoint
CREATE TABLE "dealer_import_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"salesperson_id" integer NOT NULL,
	"name" text NOT NULL,
	"pincode" text,
	"area" text,
	"address" text,
	"state" text,
	"review_category" text NOT NULL,
	"review_detail" text NOT NULL,
	"source_file" text NOT NULL,
	"source_sheet" text NOT NULL,
	"source_row" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_dealer_id" integer,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dealer_import_reviews" ADD CONSTRAINT "dealer_import_reviews_salesperson_id_salespeople_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."salespeople"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_import_reviews" ADD CONSTRAINT "dealer_import_reviews_resolved_dealer_id_dealers_id_fk" FOREIGN KEY ("resolved_dealer_id") REFERENCES "public"."dealers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dealer_import_reviews_source_unique" ON "dealer_import_reviews" USING btree ("source_file","source_sheet","source_row");--> statement-breakpoint
CREATE INDEX "dealer_import_reviews_status_idx" ON "dealer_import_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "dealer_import_reviews_salesperson_idx" ON "dealer_import_reviews" USING btree ("salesperson_id");