ALTER TABLE `responses` ADD `status` text DEFAULT 'complete' NOT NULL;--> statement-breakpoint
ALTER TABLE `responses` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `responses` ADD `resume_token_hash` text;