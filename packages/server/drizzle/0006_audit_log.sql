CREATE TABLE `audit_log` (
	`seq` integer PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`survey_id` text,
	`status` integer NOT NULL,
	`ip` text NOT NULL,
	`request_id` text NOT NULL,
	`hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_at_idx` ON `audit_log` (`at`);