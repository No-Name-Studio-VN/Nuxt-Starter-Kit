CREATE TABLE `user_two_factor` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`secret` text,
	`enabled` integer DEFAULT false NOT NULL,
	`backup_codes` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user_lock_screen` DROP COLUMN `totp_secret`;--> statement-breakpoint
ALTER TABLE `user_lock_screen` DROP COLUMN `totp_enabled`;--> statement-breakpoint
ALTER TABLE `user_lock_screen` DROP COLUMN `backup_codes`;