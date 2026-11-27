CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`actions` text NOT NULL,
	`survey_ids` text,
	`expires_at` text,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text
);
