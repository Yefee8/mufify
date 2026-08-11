import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * The two claims `maintenance.ts` makes about the schema.
 *
 * Both are properties of the tables rather than of the query builder, and both
 * are the kind of thing that changes underneath you: a cascade dropped from a
 * migration, or a favourite flag that quietly moves to another table. The
 * confirmation copy shown to the user promises exactly these, so they are
 * pinned here against the real migrations rather than trusted.
 */

const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

function freshDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  // Cascades do nothing without it — off by default in SQLite, and set by
  // `db/client.ts` on the device for this reason.
  db.exec('PRAGMA foreign_keys = ON;');

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const statements = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) db.exec(statement);
  }
  return db;
}

/** One track, one play event, and a favourite with counters on it. */
function seed(db: DatabaseSync): void {
  db.exec(`
    INSERT INTO tracks (id, file_uri, title, duration_ms, date_added, date_modified)
    VALUES (1, 'content://media/1', 'A track', 200000, 0, 0);
  `);
  db.exec(`
    INSERT INTO play_events
      (id, track_id, started_at_utc, ms_played, completed, outcome, source_type,
       week_key, month_key, year_key)
    VALUES (1, 1, 0, 200000, 1, 'play', 'library', '1970-W01', '1970-01', '1970');
  `);
  db.exec(`
    INSERT INTO track_stats (track_id, play_count, skip_count, ms_played_total, last_played_at, is_favorite, favorite_at)
    VALUES (1, 7, 2, 1400000, 123, 1, 456);
  `);
}

function count(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

describe('clearing the library', () => {
  it('takes the listening history with it, because those rows cascade', () => {
    const db = freshDatabase();
    seed(db);

    db.exec('DELETE FROM tracks');

    // This is why the confirmation says so: the user asked to clear a list and
    // the history goes too, whether or not they expected it.
    expect(count(db, 'play_events')).toBe(0);
    expect(count(db, 'track_stats')).toBe(0);
    db.close();
  });

  it('leaves playlists standing, and empties them', () => {
    const db = freshDatabase();
    seed(db);
    db.exec(`INSERT INTO playlists (id, name, created_at, updated_at) VALUES (1, 'Mix', 0, 0)`);
    db.exec(
      `INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (1, 1, 0, 0)`,
    );

    db.exec('DELETE FROM tracks');

    expect(count(db, 'playlists')).toBe(1);
    expect(count(db, 'playlist_tracks')).toBe(0);
    db.close();
  });
});

describe('clearing the statistics', () => {
  it('keeps the favourite when the counters are reset in place', () => {
    const db = freshDatabase();
    seed(db);

    // What `clearStatistics` does: delete the events, reset the counters, and
    // deliberately *not* delete the row — the favourite flag lives on it.
    db.exec('DELETE FROM play_events');
    db.exec(`
      UPDATE track_stats
      SET play_count = 0, skip_count = 0, ms_played_total = 0, last_played_at = NULL
    `);

    const row = db.prepare('SELECT * FROM track_stats WHERE track_id = 1').get() as {
      play_count: number;
      skip_count: number;
      ms_played_total: number;
      last_played_at: number | null;
      is_favorite: number;
      favorite_at: number | null;
    };

    expect(row.play_count).toBe(0);
    expect(row.skip_count).toBe(0);
    expect(row.ms_played_total).toBe(0);
    expect(row.last_played_at).toBeNull();
    // The whole reason the row is updated rather than deleted.
    expect(row.is_favorite).toBe(1);
    expect(row.favorite_at).toBe(456);
    db.close();
  });

  it('leaves the music alone', () => {
    const db = freshDatabase();
    seed(db);

    db.exec('DELETE FROM play_events');
    db.exec('DELETE FROM stats_rollups');

    expect(count(db, 'tracks')).toBe(1);
    db.close();
  });
});
