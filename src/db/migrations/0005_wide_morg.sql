ALTER TABLE `albums` ADD `is_favorite` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `albums` ADD `favorite_at` integer;