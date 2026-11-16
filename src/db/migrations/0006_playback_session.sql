CREATE TABLE `playback_session` (
	`id` integer PRIMARY KEY NOT NULL,
	`queue` text NOT NULL,
	`source_queue` text NOT NULL,
	`queue_index` integer NOT NULL,
	`position_ms` integer DEFAULT 0 NOT NULL,
	`shuffled` integer DEFAULT 0 NOT NULL,
	`shuffle_algorithm` text,
	`repeat` text DEFAULT 'off' NOT NULL,
	`source_type` text DEFAULT 'library' NOT NULL,
	`source_id` integer,
	`updated_at` integer NOT NULL
);
