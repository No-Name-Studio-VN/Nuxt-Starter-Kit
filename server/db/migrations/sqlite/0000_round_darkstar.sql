CREATE TABLE `auth_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`token` text NOT NULL,
	`type` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_token_unique` ON `auth_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `auth_tokens_user_idx` ON `auth_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_tokens_token_idx` ON `auth_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `auth_tokens_type_idx` ON `auth_tokens` (`type`);--> statement-breakpoint
CREATE INDEX `auth_tokens_expires_idx` ON `auth_tokens` (`expires_at`);--> statement-breakpoint
CREATE TABLE `credentials` (
	`user_id` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`counter` integer NOT NULL,
	`backed_up` integer NOT NULL,
	`transports` text NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `credentials_user_idx` ON `credentials` (`user_id`);--> statement-breakpoint
CREATE TABLE `feature_flag_audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`flag_key` text NOT NULL,
	`action` text NOT NULL,
	`actor_id` integer,
	`previous_value` text,
	`new_value` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ff_audit_flag_key_idx` ON `feature_flag_audit_log` (`flag_key`);--> statement-breakpoint
CREATE INDEX `ff_audit_actor_idx` ON `feature_flag_audit_log` (`actor_id`);--> statement-breakpoint
CREATE INDEX `ff_audit_created_idx` ON `feature_flag_audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`rules` text,
	`rollout_pct` integer DEFAULT 100 NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`expires_at` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `oauth_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`email` text,
	`name` text,
	`avatar_url` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_accounts_user_idx` ON `oauth_accounts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_accounts_provider_provider_account_id_unique` ON `oauth_accounts` (`provider`,`provider_account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `oauth_accounts_user_id_provider_unique` ON `oauth_accounts` (`user_id`,`provider`);--> statement-breakpoint
CREATE TABLE `user_lock_screen` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`totp_secret` text,
	`totp_enabled` integer DEFAULT false NOT NULL,
	`backup_codes` text,
	`lock_timeout` integer DEFAULT 0 NOT NULL,
	`show_message` integer DEFAULT false NOT NULL,
	`custom_message` text,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`last_failed_attempt` integer,
	`last_activity_time` integer,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`password` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	`is_locked` integer DEFAULT false NOT NULL,
	`last_login_at` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);