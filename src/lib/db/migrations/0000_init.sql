CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `charts` (
	`id` text PRIMARY KEY NOT NULL,
	`workbook_id` text NOT NULL,
	`query_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text DEFAULT '{}' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workbook_id`) REFERENCES `workbooks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`query_id`) REFERENCES `queries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `charts_workbook_id_idx` ON `charts` (`workbook_id`);--> statement-breakpoint
CREATE INDEX `charts_query_id_idx` ON `charts` (`query_id`);--> statement-breakpoint
CREATE TABLE `dashboard_favorites` (
	`user_id` text NOT NULL,
	`dashboard_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `dashboard_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dashboard_favorites_user_id_idx` ON `dashboard_favorites` (`user_id`);--> statement-breakpoint
CREATE INDEX `dashboard_favorites_dashboard_id_idx` ON `dashboard_favorites` (`dashboard_id`);--> statement-breakpoint
CREATE TABLE `dashboard_views` (
	`user_id` text NOT NULL,
	`dashboard_id` text NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`last_viewed_at` integer,
	PRIMARY KEY(`user_id`, `dashboard_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dashboard_id`) REFERENCES `dashboards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dashboard_views_user_id_idx` ON `dashboard_views` (`user_id`);--> statement-breakpoint
CREATE INDEX `dashboard_views_dashboard_id_idx` ON `dashboard_views` (`dashboard_id`);--> statement-breakpoint
CREATE TABLE `dashboards` (
	`id` text PRIMARY KEY NOT NULL,
	`workbook_id` text NOT NULL,
	`owner_id` text,
	`name` text NOT NULL,
	`slug` text,
	`layout` text DEFAULT '[]' NOT NULL,
	`filters` text DEFAULT '[]' NOT NULL,
	`auto_refresh` text DEFAULT 'off' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workbook_id`) REFERENCES `workbooks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dashboards_slug_unique` ON `dashboards` (`slug`);--> statement-breakpoint
CREATE INDEX `dashboards_owner_id_idx` ON `dashboards` (`owner_id`);--> statement-breakpoint
CREATE INDEX `dashboards_workbook_id_idx` ON `dashboards` (`workbook_id`);--> statement-breakpoint
CREATE TABLE `data_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `data_sources_slug_unique` ON `data_sources` (`slug`);--> statement-breakpoint
CREATE INDEX `data_sources_owner_id_idx` ON `data_sources` (`owner_id`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`attempted_at` integer DEFAULT (unixepoch()) NOT NULL,
	`success` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_key_attempted_at_idx` ON `login_attempts` (`key`,`attempted_at`);--> statement-breakpoint
CREATE TABLE `queries` (
	`id` text PRIMARY KEY NOT NULL,
	`workbook_id` text NOT NULL,
	`name` text NOT NULL,
	`data_source_id` text NOT NULL,
	`mode` text DEFAULT 'sql' NOT NULL,
	`definition` text DEFAULT '[]' NOT NULL,
	`sql` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workbook_id`) REFERENCES `workbooks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`data_source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `queries_workbook_id_idx` ON `queries` (`workbook_id`);--> statement-breakpoint
CREATE INDEX `queries_data_source_id_idx` ON `queries` (`data_source_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`avatar_url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workbooks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text,
	`description` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workbooks_slug_unique` ON `workbooks` (`slug`);--> statement-breakpoint
CREATE INDEX `workbooks_owner_id_idx` ON `workbooks` (`owner_id`);