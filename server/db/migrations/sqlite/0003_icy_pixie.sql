ALTER TABLE `auth_tokens` ADD `email` text;--> statement-breakpoint
ALTER TABLE `credentials` ADD `last_used_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `onboarding_pending` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `onboarding_completed_steps` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX `users_email_lower_idx` ON `users` (lower("email"));