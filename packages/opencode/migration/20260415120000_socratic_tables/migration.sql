CREATE TABLE `socratic_profile` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`global_level` integer NOT NULL DEFAULT 1,
	`preferred_mode` text NOT NULL DEFAULT 'learn',
	`preferred_language` text NOT NULL DEFAULT 'es',
	`comprehension_speed` real NOT NULL DEFAULT 0.5,
	`copy_tendency` real NOT NULL DEFAULT 0.0,
	`total_sessions` integer NOT NULL DEFAULT 0,
	`total_concepts_learned` integer NOT NULL DEFAULT 0,
	`streak_days` integer NOT NULL DEFAULT 0,
	`last_active_date` text,
	`calibration_completed` integer NOT NULL DEFAULT 0,
	`user_override` integer NOT NULL DEFAULT 0,
	`override_timestamp` integer,
	`override_sessions_count` integer NOT NULL DEFAULT 0,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `socratic_domain_level` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`domain` text NOT NULL,
	`level` integer NOT NULL DEFAULT 1,
	`confidence` real NOT NULL DEFAULT 0.5,
	`total_interactions` integer NOT NULL DEFAULT 0,
	`suggested_adjustment` integer NOT NULL DEFAULT 0,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `domain_level_domain_idx` ON `socratic_domain_level` (`domain`);
--> statement-breakpoint
CREATE TABLE `socratic_interest` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`topic` text NOT NULL,
	`frequency` integer NOT NULL DEFAULT 1,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interest_topic_idx` ON `socratic_interest` (`topic`);
--> statement-breakpoint
CREATE TABLE `socratic_error_map` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`topic` text NOT NULL,
	`domain` text NOT NULL,
	`fail_count` integer NOT NULL DEFAULT 1,
	`last_hint_level` integer NOT NULL DEFAULT 0,
	`resolved` integer NOT NULL DEFAULT 0,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `error_map_topic_domain_idx` ON `socratic_error_map` (`topic`,`domain`);
--> statement-breakpoint
CREATE TABLE `socratic_strength` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`topic` text NOT NULL,
	`domain` text NOT NULL,
	`success_count` integer NOT NULL DEFAULT 1,
	`last_seen` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `strength_topic_domain_idx` ON `socratic_strength` (`topic`,`domain`);
--> statement-breakpoint
CREATE TABLE `socratic_session` (
	`id` text PRIMARY KEY,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`total_turns` integer NOT NULL DEFAULT 0,
	`correct_count` integer NOT NULL DEFAULT 0,
	`incorrect_count` integer NOT NULL DEFAULT 0,
	`max_hint_level` integer NOT NULL DEFAULT 0,
	`user_level_start` integer,
	`user_level_end` integer,
	`mode` text NOT NULL DEFAULT 'learn',
	`topics` text,
	`concepts_learned` text
);
--> statement-breakpoint
CREATE INDEX `socratic_session_started_idx` ON `socratic_session` (`started_at`);
--> statement-breakpoint
CREATE TABLE `socratic_reasoning_step` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`session_id` text NOT NULL,
	`turn_index` integer NOT NULL,
	`topic` text,
	`correct` integer,
	`hint_level` integer NOT NULL DEFAULT 0,
	`user_level` integer NOT NULL,
	`accompanied_implementation` integer NOT NULL DEFAULT 0,
	`user_excerpt` text,
	`agent_excerpt` text,
	`domain` text,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reasoning_step_session_idx` ON `socratic_reasoning_step` (`session_id`);
--> statement-breakpoint
CREATE INDEX `reasoning_step_domain_idx` ON `socratic_reasoning_step` (`domain`);
