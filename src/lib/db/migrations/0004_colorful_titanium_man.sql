ALTER TABLE "audit_log" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;