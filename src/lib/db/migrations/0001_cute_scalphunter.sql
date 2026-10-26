CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`workbook_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`parent_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workbook_id`) REFERENCES `workbooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `folders_workbook_id_kind_idx` ON `folders` (`workbook_id`,`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `folders_workbook_id_kind_name_idx` ON `folders` (`workbook_id`,`kind`,`name`);--> statement-breakpoint
ALTER TABLE `charts` ADD `folder_id` text REFERENCES folders(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `charts` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `charts_folder_id_idx` ON `charts` (`folder_id`);--> statement-breakpoint
ALTER TABLE `dashboards` ADD `folder_id` text REFERENCES folders(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `dashboards` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `dashboards_folder_id_idx` ON `dashboards` (`folder_id`);--> statement-breakpoint
ALTER TABLE `queries` ADD `folder_id` text REFERENCES folders(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `queries` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `queries_folder_id_idx` ON `queries` (`folder_id`);