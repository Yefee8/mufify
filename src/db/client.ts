import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import * as schema from './schema';

export const DATABASE_NAME = 'mufify.db';

/**
 * Pragmas, set once per connection.
 *
 * - `journal_mode = WAL` — readers do not block the writer, so the library
 *   list stays scrollable while a scan writes.
 * - `synchronous = NORMAL` — safe under WAL, and far fewer fsyncs during the
 *   batched inserts a scan does.
 * - `foreign_keys = ON` — off by default in SQLite. Without it the cascade
 *   deletes declared in the schema are decoration.
 * - `temp_store = MEMORY` — sorts and temporary indexes stay off disk.
 */
const PRAGMAS = [
  'PRAGMA journal_mode = WAL;',
  'PRAGMA synchronous = NORMAL;',
  'PRAGMA foreign_keys = ON;',
  'PRAGMA temp_store = MEMORY;',
].join('\n');

export function applyPragmas(database: SQLiteDatabase): void {
  database.execSync(PRAGMAS);
}

// `enableChangeListener` is what makes drizzle's `useLiveQuery` react to
// writes; without it lists would need manual invalidation everywhere.
const sqlite = openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
applyPragmas(sqlite);

export const db = drizzle(sqlite, { schema });
export type Database = typeof db;
