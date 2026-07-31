-- MediaStore writes the literal string `<unknown>` rather than null for an
-- untagged artist or album. Stored as-is it became a real artist: it had an
-- `artists` row, showed under every untagged track, would have topped the
-- statistics for anyone with a folder of untagged files, and made the balanced
-- shuffle treat every untagged track as the same act.
--
-- The scanner stopped creating these, but an incremental rescan skips files
-- whose size and mtime are unchanged, so existing rows keep pointing at the
-- placeholder. This detaches and removes it once.
UPDATE tracks SET artist_id = NULL
WHERE artist_id IN (SELECT id FROM artists WHERE lower(name) = '<unknown>');
--> statement-breakpoint
UPDATE albums SET artist_id = NULL
WHERE artist_id IN (SELECT id FROM artists WHERE lower(name) = '<unknown>');
--> statement-breakpoint
UPDATE tracks SET album_id = NULL
WHERE album_id IN (SELECT id FROM albums WHERE lower(name) = '<unknown>');
--> statement-breakpoint
UPDATE tracks SET album_artist = NULL WHERE lower(album_artist) = '<unknown>';
--> statement-breakpoint
DELETE FROM albums WHERE lower(name) = '<unknown>';
--> statement-breakpoint
DELETE FROM artists WHERE lower(name) = '<unknown>';
