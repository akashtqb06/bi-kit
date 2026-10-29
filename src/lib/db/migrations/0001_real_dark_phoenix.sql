CREATE TABLE "fin_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"class" text NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"credit_limit" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"period" text DEFAULT 'monthly' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" text,
	"icon" text,
	"color" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_recurring_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"to_account_id" text,
	"category_id" text,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"payee" text,
	"note" text,
	"frequency" text NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"next_occurrence" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"to_account_id" text,
	"category_id" text,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"signed_amount" bigint NOT NULL,
	"payee" text,
	"note" text,
	"tags" text,
	"client_request_id" text,
	"import_hash" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurring_rule_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fin_transactions_amount_check" CHECK ("fin_transactions"."type" = 'adjustment' OR "fin_transactions"."amount" > 0),
	CONSTRAINT "fin_transactions_transfer_check" CHECK ("fin_transactions"."type" <> 'transfer' OR ("fin_transactions"."to_account_id" IS NOT NULL AND "fin_transactions"."to_account_id" <> "fin_transactions"."account_id"))
);
--> statement-breakpoint
CREATE TABLE "fin_valuations" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"date" date NOT NULL,
	"value" bigint NOT NULL,
	"cost_basis" bigint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_accounts" ADD CONSTRAINT "fin_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_budgets" ADD CONSTRAINT "fin_budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_budgets" ADD CONSTRAINT "fin_budgets_category_id_fin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fin_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_categories" ADD CONSTRAINT "fin_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD CONSTRAINT "fin_recurring_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD CONSTRAINT "fin_recurring_rules_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD CONSTRAINT "fin_recurring_rules_to_account_id_fin_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_recurring_rules" ADD CONSTRAINT "fin_recurring_rules_category_id_fin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fin_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD CONSTRAINT "fin_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD CONSTRAINT "fin_transactions_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD CONSTRAINT "fin_transactions_to_account_id_fin_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_transactions" ADD CONSTRAINT "fin_transactions_category_id_fin_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."fin_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fin_valuations" ADD CONSTRAINT "fin_valuations_account_id_fin_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."fin_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fin_accounts_user_id_idx" ON "fin_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fin_accounts_user_kind_idx" ON "fin_accounts" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "fin_accounts_user_active_idx" ON "fin_accounts" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "fin_budgets_user_id_idx" ON "fin_budgets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fin_budgets_user_category_idx" ON "fin_budgets" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "fin_categories_user_id_idx" ON "fin_categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fin_categories_user_type_idx" ON "fin_categories" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "fin_recurring_user_id_idx" ON "fin_recurring_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "fin_recurring_active_next_idx" ON "fin_recurring_rules" USING btree ("user_id","is_active","next_occurrence");--> statement-breakpoint
CREATE INDEX "fin_transactions_user_date_idx" ON "fin_transactions" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "fin_transactions_account_date_idx" ON "fin_transactions" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "fin_transactions_user_category_idx" ON "fin_transactions" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fin_transactions_user_client_req_idx" ON "fin_transactions" USING btree ("user_id","client_request_id") WHERE "fin_transactions"."client_request_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "fin_transactions_user_import_hash_idx" ON "fin_transactions" USING btree ("user_id","import_hash") WHERE "fin_transactions"."import_hash" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "fin_valuations_account_date_idx" ON "fin_valuations" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "fin_valuations_account_id_idx" ON "fin_valuations" USING btree ("account_id");