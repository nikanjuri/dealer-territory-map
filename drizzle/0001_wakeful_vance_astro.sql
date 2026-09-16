CREATE TYPE "public"."app_role" AS ENUM('admin', 'salesperson');--> statement-breakpoint
CREATE TABLE "app_users" (
	"auth_user_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"auth_email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "app_role" NOT NULL,
	"salesperson_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_salesperson_id_salespeople_id_fk" FOREIGN KEY ("salesperson_id") REFERENCES "public"."salespeople"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_username_unique" ON "app_users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_auth_email_unique" ON "app_users" USING btree ("auth_email");--> statement-breakpoint
CREATE UNIQUE INDEX "app_users_salesperson_unique" ON "app_users" USING btree ("salesperson_id");