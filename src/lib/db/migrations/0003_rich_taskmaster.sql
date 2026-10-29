CREATE TABLE "data_store_syncs" (
	"id" text PRIMARY KEY NOT NULL,
	"table_id" text NOT NULL,
	"status" text NOT NULL,
	"rows_synced" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	"triggered_by" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_store_tables" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"data_source_id" text,
	"query_id" text,
	"kind" text DEFAULT 'table' NOT NULL,
	"source_table" text NOT NULL,
	"store_schema" text NOT NULL,
	"store_table" text NOT NULL,
	"columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"schedule" text DEFAULT 'manual' NOT NULL,
	"sync_mode" text DEFAULT 'full' NOT NULL,
	"cursor_column" text,
	"last_watermark" text,
	"indexed_columns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"included_columns" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_store_syncs" ADD CONSTRAINT "data_store_syncs_table_id_data_store_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."data_store_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_store_tables" ADD CONSTRAINT "data_store_tables_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_store_tables" ADD CONSTRAINT "data_store_tables_data_source_id_data_sources_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_store_tables" ADD CONSTRAINT "data_store_tables_query_id_queries_id_fk" FOREIGN KEY ("query_id") REFERENCES "public"."queries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_store_syncs_table_id_idx" ON "data_store_syncs" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "data_store_syncs_started_at_idx" ON "data_store_syncs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "data_store_tables_owner_id_idx" ON "data_store_tables" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "data_store_tables_data_source_id_idx" ON "data_store_tables" USING btree ("data_source_id");--> statement-breakpoint
CREATE INDEX "data_store_tables_query_id_idx" ON "data_store_tables" USING btree ("query_id");--> statement-breakpoint
CREATE UNIQUE INDEX "data_store_tables_schema_table_idx" ON "data_store_tables" USING btree ("store_schema","store_table");