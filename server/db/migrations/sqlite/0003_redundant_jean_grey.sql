ALTER TABLE `auth_tokens` ADD `email` text;--> statement-breakpoint
CREATE INDEX `users_email_lower_idx` ON `users` (lower("email"));