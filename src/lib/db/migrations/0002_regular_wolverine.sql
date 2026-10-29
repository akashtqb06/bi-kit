CREATE TABLE "fin_user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"base_currency" text DEFAULT 'INR' NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"week_starts_on" integer DEFAULT 1 NOT NULL,
	"tracking_start_date" date,
	"setup_step" integer DEFAULT 1 NOT NULL,
	"setup_completed_at" timestamp with time zone,
	"setup_skipped_at" timestamp with time zone,
	"draft" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_user_settings" ADD CONSTRAINT "fin_user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;