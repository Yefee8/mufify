ALTER TABLE `playlists` ADD `is_favorite` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `playlists` ADD `favorite_at` integer;