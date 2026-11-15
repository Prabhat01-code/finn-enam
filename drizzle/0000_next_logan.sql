CREATE TABLE `records` (
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`symbol` text,
	`published_at` text,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`kind`, `id`)
);
--> statement-breakpoint
CREATE INDEX `records_kind_symbol` ON `records` (`kind`,`symbol`);--> statement-breakpoint
CREATE INDEX `records_kind_date` ON `records` (`kind`,`published_at`);