ALTER TABLE "creations" ADD COLUMN "shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "creations" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "creations" ADD COLUMN "imports" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "creations_shared_idx" ON "creations" USING btree ("shared");