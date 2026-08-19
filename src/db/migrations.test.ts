import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Apply the committed migrations to a fresh SQLite database and check what
 * they produce.
 *
 * This is the "migrations run on a clean install" check, minus the device.
 * It catches invalid SQL, a table renamed in `schema.ts` but never generated,
 * and an index that silently stopped existing — all of which would otherwise
 * only show up as a crash on someone's phone.
 */

const MIGRATIONS_DIR = join(__dirname, 'migrations');

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

/** drizzle-kit separates statements with `--> statement-breakpoint`. */
function statementsOf(file: string): string[] {
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function freshDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const file of migrationFiles()) {
    for (const statement of statementsOf(file)) db.exec(statement);
  }
  return db;
}

describe('migrations', () => {
  it('has at least one committed migration', () => {
    expect(migrationFiles().length).toBeGreaterThan(0);
  });

  it('applies cleanly to an empty database', () => {
    expect(() => freshDatabase()).not.toThrow();
  });

  it('creates every table the schema declares', () => {
    const db = freshDatabase();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const tables = rows.map((row) => row.name).sort();

    expect(tables).toEqual([
      'albums',
      'artists',
      'play_events',
      'playlist_tracks',
      'playlists',
      'scan_folders',
      'stats_rollups',
      'track_stats',
      'tracks',
    ]);
  });

  it('creates the indexes the hot queries depend on', () => {
    const db = freshDatabase();
    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[];
    const indexes = new Set(rows.map((row) => row.name));

    // The library list and search.
    expect(indexes).toContain('tracks_title_nocase_idx');
    expect(indexes).toContain('tracks_artist_idx');
    expect(indexes).toContain('tracks_album_idx');
    // Rescan identity.
    expect(indexes).toContain('tracks_file_uri_unique');
    // Stats.
    expect(indexes).toContain('play_events_started_idx');
    expect(indexes).toContain('play_events_track_idx');
    // The rollup upsert target.
    expect(indexes).toContain('stats_rollups_unique');
  });

  it('leaves the spec strip columns nullable', () => {
    // MediaMetadataRetriever returns null for these below API 31 and whenever
    // the extractor does not populate them. A NOT NULL here would crash a scan.
    const db = freshDatabase();
    const columns = db.prepare('PRAGMA table_info(tracks)').all() as {
      name: string;
      notnull: number;
    }[];
    const byName = new Map(columns.map((column) => [column.name, column.notnull]));

    for (const column of [
      'bitrate_kbps',
      'sample_rate_hz',
      'bit_depth',
      'channels',
      'container',
      'codec',
      'file_size',
    ]) {
      expect(byName.get(column)).toBe(0);
    }
  });

  it('stores the liked timestamp without making existing stats rows invalid', () => {
    const db = freshDatabase();
    const columns = db.prepare('PRAGMA table_info(track_stats)').all() as {
      name: string;
      notnull: number;
      type: string;
    }[];
    const favoriteAt = columns.find((column) => column.name === 'favorite_at');

    expect(favoriteAt?.type.toLowerCase()).toBe('integer');
    expect(favoriteAt?.notnull).toBe(0);
  });

  it('gives an existing playlist a liked flag it can survive the migration with', () => {
    // Added to a table that already has rows on every upgraded install, so the
    // default is what decides whether every playlist arrives pre-liked.
    const db = freshDatabase();
    const columns = db.prepare('PRAGMA table_info(playlists)').all() as {
      name: string;
      notnull: number;
      dflt_value: string | null;
    }[];
    const byName = new Map(columns.map((column) => [column.name, column]));

    expect(byName.get('is_favorite')?.notnull).toBe(1);
    expect(Number(byName.get('is_favorite')?.dflt_value)).toBe(0);
    expect(byName.get('favorite_at')?.notnull).toBe(0);
  });

  it('gives an existing album a liked flag it can survive the migration with', () => {
    // Added to a table that already has rows on every upgraded install, so the
    // default is what decides whether every album arrives pre-liked.
    const db = freshDatabase();
    const columns = db.prepare('PRAGMA table_info(albums)').all() as {
      name: string;
      notnull: number;
      dflt_value: string | null;
    }[];
    const byName = new Map(columns.map((column) => [column.name, column]));

    expect(byName.get('is_favorite')?.notnull).toBe(1);
    expect(Number(byName.get('is_favorite')?.dflt_value)).toBe(0);
    expect(byName.get('favorite_at')?.notnull).toBe(0);
  });

  it('stores artwork as a path, never as bytes', () => {
    const db = freshDatabase();
    for (const table of ['tracks', 'albums', 'playlists']) {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string;
        type: string;
      }[];
      const artwork = columns.find((column) => column.name === 'artwork_path');
      expect(artwork?.type.toLowerCase()).toBe('text');
      expect(columns.some((column) => column.type.toLowerCase() === 'blob')).toBe(false);
    }
  });

  it('enforces one row per file_uri, so a rescan cannot duplicate a track', () => {
    const db = freshDatabase();
    const insert = db.prepare(
      "INSERT INTO tracks (file_uri, title, duration_ms, date_added, date_modified) VALUES (?, 'T', 1000, 0, 0)",
    );
    insert.run('file:///a.flac');
    expect(() => insert.run('file:///a.flac')).toThrow();
  });

  it('records the listen outcome on the event itself', () => {
    // Stored rather than re-derived: the thresholds are duration-dependent,
    // so recomputing later would silently reclassify existing history.
    const db = freshDatabase();
    const columns = db.prepare('PRAGMA table_info(play_events)').all() as {
      name: string;
      notnull: number;
      dflt_value: string | null;
    }[];
    const outcome = columns.find((column) => column.name === 'outcome');

    expect(outcome).toBeDefined();
    expect(outcome?.notnull).toBe(1);
    // A default is what makes the ALTER TABLE safe on a populated database.
    expect(outcome?.dflt_value).toContain('partial');
  });

  it('enforces the rollup uniqueness the upsert relies on', () => {
    const db = freshDatabase();
    const insert = db.prepare(
      "INSERT INTO stats_rollups (period_type, period_key, entity_type, entity_id, updated_at) VALUES ('week', '2026-W31', 'track', 1, 0)",
    );
    insert.run();
    expect(() => insert.run()).toThrow();
  });

  it('cascades play events when a track really is deleted', () => {
    const db = freshDatabase();
    db.exec(
      "INSERT INTO tracks (id, file_uri, title, duration_ms, date_added, date_modified) VALUES (1, 'file:///a.flac', 'T', 1000, 0, 0)",
    );
    db.exec(
      "INSERT INTO play_events (track_id, started_at_utc, ms_played, outcome, source_type, week_key, month_key, year_key) VALUES (1, 0, 500, 'partial', 'library', '2026-W31', '2026-07', '2026')",
    );
    db.exec('DELETE FROM tracks WHERE id = 1');

    const [row] = db.prepare('SELECT COUNT(*) AS value FROM play_events').all() as {
      value: number;
    }[];
    expect(row?.value).toBe(0);
  });
});
