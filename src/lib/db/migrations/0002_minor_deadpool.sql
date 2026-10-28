CREATE TABLE `schema_cache` (
	`data_source_id` text PRIMARY KEY NOT NULL,
	`snapshot` text NOT NULL,
	`fetched_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`data_source_id`) REFERENCES `data_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `data_sources` ADD `status` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `data_sources` ADD `last_tested_at` integer;--> statement-breakpoint
ALTER TABLE `data_sources` ADD `last_error` text;--> statement-breakpoint
ALTER TABLE `data_sources` ADD `server_version` text;