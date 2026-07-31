ALTER TABLE `play_events` ADD `outcome` text DEFAULT 'partial' NOT NULL;--> statement-breakpoint
CREATE INDEX `play_events_outcome_idx` ON `play_events` (`outcome`);