ALTER TABLE `users` ADD `onboarding_pending` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `onboarding_completed_steps` text DEFAULT '[]' NOT NULL;