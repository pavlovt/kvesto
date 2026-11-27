ALTER TABLE `responses` ADD `respondent_id` text;--> statement-breakpoint
ALTER TABLE `responses` ADD `respondent_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `responses_respondent_key_idx` ON `responses` (`survey_id`,`respondent_key`);