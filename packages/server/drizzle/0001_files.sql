CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`survey_id` text NOT NULL,
	`question_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`data` blob NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`survey_id`) REFERENCES `surveys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `files_survey_id_idx` ON `files` (`survey_id`);