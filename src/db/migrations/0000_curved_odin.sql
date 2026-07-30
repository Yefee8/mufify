CREATE TABLE `albums` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`artist_id` integer,
	`year` integer,
	`artwork_path` text,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `albums_artist_idx` ON `albums` (`artist_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `albums_name_artist_unique` ON `albums` (`name`,`artist_id`);--> statement-breakpoint
CREATE TABLE `artists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artists_name_unique` ON `artists` (`name`);--> statement-breakpoint
CREATE TABLE `play_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`track_id` integer NOT NULL,
	`started_at_utc` integer NOT NULL,
	`ms_played` integer NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`source_type` text NOT NULL,
	`source_id` integer,
	`shuffle_algorithm` text,
	`week_key` text NOT NULL,
	`month_key` text NOT NULL,
	`year_key` text NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `play_events_started_idx` ON `play_events` (`started_at_utc`);--> statement-breakpoint
CREATE INDEX `play_events_track_idx` ON `play_events` (`track_id`);--> statement-breakpoint
CREATE INDEX `play_events_week_idx` ON `play_events` (`week_key`);--> statement-breakpoint
CREATE INDEX `play_events_month_idx` ON `play_events` (`month_key`);--> statement-breakpoint
CREATE TABLE `playlist_tracks` (
	`playlist_id` integer NOT NULL,
	`track_id` integer NOT NULL,
	`position` integer NOT NULL,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_tracks_pk` ON `playlist_tracks` (`playlist_id`,`position`);--> statement-breakpoint
CREATE INDEX `playlist_tracks_track_idx` ON `playlist_tracks` (`track_id`);--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`artwork_path` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scan_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uri` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scan_folders_uri_unique` ON `scan_folders` (`uri`);--> statement-breakpoint
CREATE TABLE `stats_rollups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`period_type` text NOT NULL,
	`period_key` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`play_count` integer DEFAULT 0 NOT NULL,
	`ms_played` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stats_rollups_unique` ON `stats_rollups` (`period_type`,`period_key`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `track_stats` (
	`track_id` integer PRIMARY KEY NOT NULL,
	`play_count` integer DEFAULT 0 NOT NULL,
	`skip_count` integer DEFAULT 0 NOT NULL,
	`ms_played_total` integer DEFAULT 0 NOT NULL,
	`last_played_at` integer,
	`is_favorite` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_store_id` text,
	`file_uri` text NOT NULL,
	`title` text NOT NULL,
	`artist_id` integer,
	`album_id` integer,
	`album_artist` text,
	`genre` text,
	`track_no` integer,
	`disc_no` integer,
	`year` integer,
	`duration_ms` integer NOT NULL,
	`file_size` integer,
	`container` text,
	`codec` text,
	`bitrate_kbps` integer,
	`sample_rate_hz` integer,
	`bit_depth` integer,
	`channels` integer,
	`artwork_path` text,
	`date_added` integer NOT NULL,
	`date_modified` integer NOT NULL,
	`last_scanned_at` integer,
	`is_missing` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_file_uri_unique` ON `tracks` (`file_uri`);--> statement-breakpoint
CREATE INDEX `tracks_artist_idx` ON `tracks` (`artist_id`);--> statement-breakpoint
CREATE INDEX `tracks_album_idx` ON `tracks` (`album_id`);--> statement-breakpoint
CREATE INDEX `tracks_genre_idx` ON `tracks` (`genre`);--> statement-breakpoint
CREATE INDEX `tracks_missing_idx` ON `tracks` (`is_missing`);--> statement-breakpoint
CREATE INDEX `tracks_title_nocase_idx` ON `tracks` ("title" COLLATE NOCASE);