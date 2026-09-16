CREATE TYPE "public"."location_precision" AS ENUM('address', 'pincode');--> statement-breakpoint
CREATE TYPE "public"."route_plan_status" AS ENUM('draft', 'optimized', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."state" AS ENUM('Telangana', 'Andhra Pradesh');--> statement-breakpoint
CREATE TYPE "public"."validation_source" AS ENUM('postal-directory', 'manual');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('verified', 'review', 'invalid', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('planned', 'arrived', 'completed', 'skipped');--> statement-breakpoint
CREATE TABLE "dealers" (
	"id" serial PRIMARY KEY NOT NULL,
	"salesperson_id" integer NOT NULL,
	"name" text NOT NULL,
	"pincode" text NOT NULL,
	"area" text NOT NULL,
	"address" text,
	"state" "state" NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"location_precision" "location_precision" DEFAULT 'pincode' NOT NULL,
	"google_place_id" text,
	"geocoded_address" text,
	"review_note" text,
	"postal_suggestions" jsonb,
	"validation_status" "validation_status" DEFAULT 'unavailable' NOT NULL,
	"validation_source" "validation_source",
	"validation_checked_at" timestamp with time zone,
	"validation_dataset" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"salesperson_id" integer NOT NULL,
	"route_date" date NOT NULL,
	"status" "route_plan_status" DEFAULT 'draft' NOT NULL,
	"start_latitude" double precision,
	"start_longitude" double precision,
	"end_latitude" double precision,
	"end_longitude" double precision,
	"workday_start" timestamp with time zone,
	"workday_end" timestamp with time zone,
	"optimization_provider" text,
	"optimization_summary" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_stops" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_plan_id" integer NOT NULL,
	"dealer_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"planned_arrival_at" timestamp with time zone,
	"planned_departure_at" timestamp with time zone,
	"travel_seconds" integer,
	"travel_meters" integer,
	"status" "visit_status" DEFAULT 'planned' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salespeople" (
	"id" serial PRIMARY KEY NOT NULL,
	"normalized_name" text NOT NULL,
	"display_name" text NOT NULL,
	"color" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "territory_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"pincode" text NOT NULL,
	"state" "state" NOT NULL,
	"salesperson_id" integer NOT NULL,
	"boundary_geojson" jsonb,
	"source" text DEFAULT 'postal-boundary' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"dealer_id" integer NOT NULL,
	"frequency_days" integer DEFAULT 30 NOT NULL,
	"service_minutes" integer DEFAULT 30 NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"next_due_at" date,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visit_rules_dealer_id_unique" UNIQUE("dealer_id")
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" serial PRIMARY KEY NOT NULL,
	"dealer_id" integer NOT NULL,
	"route_stop_id" integer,
	"salesperson_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"status" "visit_status" DEFAULT 'planned' NOT NULL,
	"arrived_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"check_in_latitude" double precision,
	"check_in_longitude" double precision,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dealers" ADD CONSTRAINT "dealers_salesperson_id_salespeople_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."salespeople"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_plans" ADD CONSTRAINT "route_plans_salesperson_id_salespeople_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."salespeople"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_plan_id_route_plans_id_fk" FOREIGN KEY ("route_plan_id") REFERENCES "public"."route_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territory_assignments" ADD CONSTRAINT "territory_assignments_salesperson_id_salespeople_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."salespeople"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visit_rules" ADD CONSTRAINT "visit_rules_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_dealer_id_dealers_id_fk" FOREIGN KEY ("dealer_id") REFERENCES "public"."dealers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_route_stop_id_route_stops_id_fk" FOREIGN KEY ("route_stop_id") REFERENCES "public"."route_stops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_salesperson_id_salespeople_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."salespeople"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dealers_assignment_unique" ON "dealers" USING btree ("salesperson_id","name","pincode");--> statement-breakpoint
CREATE INDEX "dealers_pincode_idx" ON "dealers" USING btree ("pincode");--> statement-breakpoint
CREATE INDEX "dealers_salesperson_idx" ON "dealers" USING btree ("salesperson_id");--> statement-breakpoint
CREATE INDEX "route_plans_salesperson_date_idx" ON "route_plans" USING btree ("salesperson_id","route_date");--> statement-breakpoint
CREATE UNIQUE INDEX "route_stops_plan_sequence_unique" ON "route_stops" USING btree ("route_plan_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "salespeople_normalized_name_unique" ON "salespeople" USING btree ("normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "territory_assignments_pincode_unique" ON "territory_assignments" USING btree ("pincode");--> statement-breakpoint
CREATE INDEX "visits_dealer_completed_idx" ON "visits" USING btree ("dealer_id","completed_at");