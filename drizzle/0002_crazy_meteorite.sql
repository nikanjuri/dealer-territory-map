DROP INDEX "dealers_assignment_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "dealers_identity_unique" ON "dealers" USING btree ("name","pincode");