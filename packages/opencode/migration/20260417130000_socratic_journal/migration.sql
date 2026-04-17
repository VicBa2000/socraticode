CREATE TABLE `socratic_journal` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`session_id` text NOT NULL,
	`entry_date` text NOT NULL,
	`learned` text NOT NULL DEFAULT '[]',
	`practiced` text NOT NULL DEFAULT '[]',
	`struggled` text NOT NULL DEFAULT '[]',
	`total_turns` integer NOT NULL DEFAULT 0,
	`comprehension_rate` real NOT NULL DEFAULT 0,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `journal_date_idx` ON `socratic_journal` (`entry_date`);
--> statement-breakpoint
CREATE INDEX `journal_created_idx` ON `socratic_journal` (`created_at`);
