CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"data_source_id" text,
	"host" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "charts" (
	"id" text PRIMARY KEY NOT NULL,
	"workbook_id" text NOT NULL,
	"query_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"folder_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_favorites" (
	"user_id" text NOT NULL,
	"dashboard_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_favorites_user_id_dashboard_id_pk" PRIMARY KEY("user_id","dashboard_id")
);
--> statement-breakpoint
CREATE TABLE "dashboard_views" (
	"user_id" text NOT NULL,
	"dashboard_id" text NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	CONSTRAINT "dashboard_views_user_id_dashboard_id_pk" PRIMARY KEY("user_id","dashboard_id")
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" text PRIMARY KEY NOT NULL,
	"workbook_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"layout" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_refresh" text DEFAULT 'off' NOT NULL,
	"folder_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "data_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_error" text,
	"server_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" text PRIMARY KEY NOT NULL,
	"workbook_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"success" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "queries" (
	"id" text PRIMARY KEY NOT NULL,
	"workbook_id" text NOT NULL,
	"name" text NOT NULL,
	"data_source_id" text NOT NULL,
	"mode" text DEFAULT 'sql' NOT NULL,
	"definition" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sql" text DEFAULT '' NOT NULL,
	"folder_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_cache" (
	"data_source_id" text PRIMARY KEY NOT NULL,
	"snapshot" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workbooks" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workbooks_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_workbook_id_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."workbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_query_id_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."queries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charts" ADD CONSTRAINT "charts_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_favorites" ADD CONSTRAINT "dashboard_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_favorites" ADD CONSTRAINT "dashboard_favorites_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_views" ADD CONSTRAINT "dashboard_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_views" ADD CONSTRAINT "dashboard_views_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_workbook_id_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."workbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_workbook_id_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."workbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_workbook_id_workbooks_id_fk" FOREIGN KEY ("workbook_id") REFERENCES "public"."workbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "queries" ADD CONSTRAINT "queries_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schema_cache" ADD CONSTRAINT "schema_cache_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workbooks" ADD CONSTRAINT "workbooks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charts_workbook_id_idx" ON "charts" USING btree ("workbook_id");--> statement-breakpoint
CREATE INDEX "charts_query_id_idx" ON "charts" USING btree ("query_id");--> statement-breakpoint
CREATE INDEX "charts_folder_id_idx" ON "charts" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "dashboard_favorites_user_id_idx" ON "dashboard_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dashboard_favorites_dashboard_id_idx" ON "dashboard_favorites" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX "dashboard_views_user_id_idx" ON "dashboard_views" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dashboard_views_dashboard_id_idx" ON "dashboard_views" USING btree ("dashboard_id");--> statement-breakpoint
CREATE INDEX "dashboards_owner_id_idx" ON "dashboards" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "dashboards_workbook_id_idx" ON "dashboards" USING btree ("workbook_id");--> statement-breakpoint
CREATE INDEX "dashboards_folder_id_idx" ON "dashboards" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "data_sources_owner_id_idx" ON "data_sources" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "folders_workbook_id_kind_idx" ON "folders" USING btree ("workbook_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "folders_workbook_id_kind_name_idx" ON "folders" USING btree ("workbook_id","kind","name");--> statement-breakpoint
CREATE INDEX "login_attempts_key_attempted_at_idx" ON "login_attempts" USING btree ("key","attempted_at");--> statement-breakpoint
CREATE INDEX "queries_workbook_id_idx" ON "queries" USING btree ("workbook_id");--> statement-breakpoint
CREATE INDEX "queries_data_source_id_idx" ON "queries" USING btree ("data_source_id");--> statement-breakpoint
CREATE INDEX "queries_folder_id_idx" ON "queries" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "workbooks_owner_id_idx" ON "workbooks" USING btree ("owner_id");