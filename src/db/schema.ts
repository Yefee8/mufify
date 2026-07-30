import { relations, sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/*
 * Schema per docs/01-TECH-STACK.md §5.
 *
 * Two rules this file exists to enforce:
 *  - No blobs. Artwork lives on disk; the database stores a path.
 *  - Rows are never deleted during a rescan. A file that is temporarily gone
 *    gets `isMissing = 1`, so playlists and play history survive an unmounted
 *    SD card.
 */

export const artists = sqliteTable(
  'artists',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    /** Case- and article-stripped form used for ordering. */
    sortName: text('sort_name').notNull(),
  },
  (table) => [uniqueIndex('artists_name_unique').on(table.name)],
);

export const albums = sqliteTable(
  'albums',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    artistId: integer('artist_id').references(() => artists.id, { onDelete: 'set null' }),
    year: integer('year'),
    /** Path into the artwork cache. Never image bytes. */
    artworkPath: text('artwork_path'),
  },
  (table) => [
    index('albums_artist_idx').on(table.artistId),
    uniqueIndex('albums_name_artist_unique').on(table.name, table.artistId),
  ],
);

export const tracks = sqliteTable(
  'tracks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** MediaStore `_id`, so a rescan can match rows without re-reading tags. */
    mediaStoreId: text('media_store_id'),
    fileUri: text('file_uri').notNull(),
    title: text('title').notNull(),
    artistId: integer('artist_id').references(() => artists.id, { onDelete: 'set null' }),
    albumId: integer('album_id').references(() => albums.id, { onDelete: 'set null' }),
    albumArtist: text('album_artist'),
    genre: text('genre'),
    trackNo: integer('track_no'),
    discNo: integer('disc_no'),
    year: integer('year'),
    durationMs: integer('duration_ms').notNull(),
    fileSize: integer('file_size'),

    // The spec strip. All nullable: MediaMetadataRetriever returns null for
    // these on API < 31 and whenever the extractor does not populate them.
    container: text('container'),
    codec: text('codec'),
    bitrateKbps: integer('bitrate_kbps'),
    sampleRateHz: integer('sample_rate_hz'),
    bitDepth: integer('bit_depth'),
    channels: integer('channels'),

    artworkPath: text('artwork_path'),
    dateAdded: integer('date_added').notNull(),
    dateModified: integer('date_modified').notNull(),
    /** Null until stage two of the scan has enriched the row. */
    lastScannedAt: integer('last_scanned_at'),
    isMissing: integer('is_missing').notNull().default(0),
  },
  (table) => [
    uniqueIndex('tracks_file_uri_unique').on(table.fileUri),
    index('tracks_artist_idx').on(table.artistId),
    index('tracks_album_idx').on(table.albumId),
    index('tracks_genre_idx').on(table.genre),
    index('tracks_missing_idx').on(table.isMissing),
    // Drives the alphabetical library list and the search box.
    index('tracks_title_nocase_idx').on(sql`${table.title} COLLATE NOCASE`),
  ],
);

export const trackStats = sqliteTable('track_stats', {
  trackId: integer('track_id')
    .primaryKey()
    .references(() => tracks.id, { onDelete: 'cascade' }),
  playCount: integer('play_count').notNull().default(0),
  skipCount: integer('skip_count').notNull().default(0),
  msPlayedTotal: integer('ms_played_total').notNull().default(0),
  lastPlayedAt: integer('last_played_at'),
  isFavorite: integer('is_favorite').notNull().default(0),
});

export const playlists = sqliteTable('playlists', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  artworkPath: text('artwork_path'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const playlistTracks = sqliteTable(
  'playlist_tracks',
  {
    playlistId: integer('playlist_id')
      .notNull()
      .references(() => playlists.id, { onDelete: 'cascade' }),
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    addedAt: integer('added_at').notNull(),
  },
  (table) => [
    // Position is part of the key so reordering is a single update sweep.
    uniqueIndex('playlist_tracks_pk').on(table.playlistId, table.position),
    index('playlist_tracks_track_idx').on(table.trackId),
  ],
);

export const playEvents = sqliteTable(
  'play_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    trackId: integer('track_id')
      .notNull()
      .references(() => tracks.id, { onDelete: 'cascade' }),
    startedAtUtc: integer('started_at_utc').notNull(),
    msPlayed: integer('ms_played').notNull(),
    completed: integer('completed').notNull().default(0),

    /**
     * 'play' | 'skip' | 'partial', decided once by `classifyListen` and
     * stored rather than re-derived. A rollup rebuild must agree with the
     * counters that were written at the time, and the rule's thresholds are
     * duration-dependent — recomputing later would silently reclassify
     * history if the rule ever moved.
     */
    outcome: text('outcome').notNull().default('partial'),

    /** 'library' | 'album' | 'artist' | 'playlist' | 'queue'. */
    sourceType: text('source_type').notNull(),
    sourceId: integer('source_id'),
    /** Null when playing sequentially. */
    shuffleAlgorithm: text('shuffle_algorithm'),

    // Written at insert time in the user's local timezone — never derived at
    // read time. See src/services/stats/periodKeys.ts.
    weekKey: text('week_key').notNull(),
    monthKey: text('month_key').notNull(),
    yearKey: text('year_key').notNull(),
  },
  (table) => [
    index('play_events_started_idx').on(table.startedAtUtc),
    index('play_events_track_idx').on(table.trackId),
    index('play_events_week_idx').on(table.weekKey),
    index('play_events_month_idx').on(table.monthKey),
    index('play_events_outcome_idx').on(table.outcome),
  ],
);

export const statsRollups = sqliteTable(
  'stats_rollups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** 'week' | 'month' | 'year'. */
    periodType: text('period_type').notNull(),
    periodKey: text('period_key').notNull(),
    /** 'track' | 'artist' | 'album' | 'playlist'. */
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    playCount: integer('play_count').notNull().default(0),
    msPlayed: integer('ms_played').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    // The upsert target. Stats screens read this table and nothing else.
    uniqueIndex('stats_rollups_unique').on(
      table.periodType,
      table.periodKey,
      table.entityType,
      table.entityId,
    ),
  ],
);

export const scanFolders = sqliteTable(
  'scan_folders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uri: text('uri').notNull(),
    enabled: integer('enabled').notNull().default(1),
  },
  (table) => [uniqueIndex('scan_folders_uri_unique').on(table.uri)],
);

export const artistsRelations = relations(artists, ({ many }) => ({
  albums: many(albums),
  tracks: many(tracks),
}));

export const albumsRelations = relations(albums, ({ one, many }) => ({
  artist: one(artists, { fields: [albums.artistId], references: [artists.id] }),
  tracks: many(tracks),
}));

export const tracksRelations = relations(tracks, ({ one, many }) => ({
  artist: one(artists, { fields: [tracks.artistId], references: [artists.id] }),
  album: one(albums, { fields: [tracks.albumId], references: [albums.id] }),
  stats: one(trackStats, { fields: [tracks.id], references: [trackStats.trackId] }),
  playEvents: many(playEvents),
}));

export const playlistsRelations = relations(playlists, ({ many }) => ({
  entries: many(playlistTracks),
}));

export const playlistTracksRelations = relations(playlistTracks, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistTracks.playlistId],
    references: [playlists.id],
  }),
  track: one(tracks, { fields: [playlistTracks.trackId], references: [tracks.id] }),
}));

export type Track = typeof tracks.$inferSelect;
export type NewTrack = typeof tracks.$inferInsert;
export type Artist = typeof artists.$inferSelect;
export type Album = typeof albums.$inferSelect;
export type Playlist = typeof playlists.$inferSelect;
export type PlayEvent = typeof playEvents.$inferSelect;
export type NewPlayEvent = typeof playEvents.$inferInsert;
export type StatsRollup = typeof statsRollups.$inferSelect;
