# 013 — Unknown metadata stays null

## Context

Some audio files have no artist or album tag. Treating that as a string made
one language leak into persistent data and left null-safe failures in grouping,
sorting and the artist screen. Skipping null artist and album rollups made the
statistics omit real listening time.

## Decision

Tracks keep `artist_id` and `album_id` null when metadata is absent. Library
queries group those nulls as one reserved display card, while rollups use entity
id `0`, which cannot collide with SQLite's positive ids. UI labels that entry
through i18n as Unknown Artist or Unknown Album; scanner maps `ARTIST`,
`ALBUM`, and `ALBUMARTIST` into the normalised foreign keys when they exist.

## Consequences

Missing metadata is visible, navigable and counted without storing a translated
placeholder row. Stats queries must left-join artists and albums for id `0`.
Balanced shuffle continues to treat each null artist as an individual bucket,
which avoids inventing a single performer for unrelated loose tracks.
