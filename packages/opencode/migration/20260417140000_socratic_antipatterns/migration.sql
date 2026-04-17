CREATE TABLE `socratic_antipattern` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`error_class` text NOT NULL,
	`label` text NOT NULL,
	`occurrence_count` integer NOT NULL DEFAULT 1,
	`correct_streak` integer NOT NULL DEFAULT 0,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`active` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX `antipattern_error_class_idx` ON `socratic_antipattern` (`error_class`);
