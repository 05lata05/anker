CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`direction` text NOT NULL,
	`unlocked` integer DEFAULT false NOT NULL,
	`introduced_at` integer NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`due` integer NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`last_review` integer,
	`scheduled_days` integer DEFAULT 0 NOT NULL,
	`learning_steps` integer DEFAULT 0 NOT NULL,
	`same_day_reinforcement_due` integer,
	`suspended` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_item_direction_idx` ON `cards` (`item_id`,`direction`);--> statement-breakpoint
CREATE INDEX `cards_due_idx` ON `cards` (`unlocked`,`suspended`,`due`);--> statement-breakpoint
CREATE TABLE `day_log` (
	`day` text PRIMARY KEY NOT NULL,
	`new_items_introduced` integer DEFAULT 0 NOT NULL,
	`reviews_done` integer DEFAULT 0 NOT NULL,
	`queue_cleared` integer DEFAULT false NOT NULL,
	`frozen` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `error_profile` (
	`tag` text PRIMARY KEY NOT NULL,
	`ema_error_rate` real DEFAULT 0 NOT NULL,
	`exposures` integer DEFAULT 0 NOT NULL,
	`last_updated` integer NOT NULL,
	`last_drill_at` integer
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`de` text NOT NULL,
	`it` text NOT NULL,
	`literal_it` text,
	`audio_path` text,
	`tts_fallback` integer DEFAULT true NOT NULL,
	`gender` text,
	`plural` text,
	`cefr` text NOT NULL,
	`freq_rank` integer NOT NULL,
	`topic` text NOT NULL,
	`tags` text NOT NULL,
	`cognate_it` text,
	`cognate_en` text,
	`false_friend` integer DEFAULT false NOT NULL,
	`false_friend_note` text,
	`transformations` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `items_freq_idx` ON `items` (`freq_rank`);--> statement-breakpoint
CREATE INDEX `items_topic_idx` ON `items` (`topic`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`cefr` text NOT NULL,
	`topic` text NOT NULL,
	`lines` text NOT NULL,
	`audio_path` text,
	`target_item_ids` text NOT NULL,
	`questions` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lessons_cefr_idx` ON `lessons` (`cefr`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`ts` integer NOT NULL,
	`rating` integer NOT NULL,
	`latency_ms` integer NOT NULL,
	`was_correct` integer NOT NULL,
	`user_answer` text,
	`phase` text NOT NULL,
	`self_assessed` integer DEFAULT false NOT NULL,
	`same_day_reinforcement` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reviews_card_ts_idx` ON `reviews` (`card_id`,`ts`);--> statement-breakpoint
CREATE INDEX `reviews_ts_idx` ON `reviews` (`ts`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`started_at` integer NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`phases_completed` text NOT NULL,
	`new_items` integer DEFAULT 0 NOT NULL,
	`reviews_done` integer DEFAULT 0 NOT NULL,
	`accuracy` real DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`resume_state` text
);
--> statement-breakpoint
CREATE INDEX `sessions_day_idx` ON `sessions` (`day`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`daily_goal_min` integer DEFAULT 20 NOT NULL,
	`max_new_items_per_day` integer DEFAULT 6 NOT NULL,
	`desired_retention` real DEFAULT 0.88 NOT NULL,
	`gender_colors_enabled` integer DEFAULT true NOT NULL,
	`tts_speed` real DEFAULT 1 NOT NULL,
	`day_rollover_hour` integer DEFAULT 4 NOT NULL,
	`initial_blocking` integer DEFAULT false NOT NULL,
	`leech_lapse_threshold` integer DEFAULT 8 NOT NULL,
	`streak_freezes_left` integer DEFAULT 2 NOT NULL,
	`freeze_month` text DEFAULT '' NOT NULL,
	`level` text DEFAULT 'A1' NOT NULL,
	`fsrs_weights` text,
	`onboarding_done` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
