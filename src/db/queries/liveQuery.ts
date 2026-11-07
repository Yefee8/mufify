import { is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import { createChangeBatcher } from '../changeBatcher';

/**
 * How long a burst of row changes is gathered before subscribers re-run.
 *
 * One frame. Long enough that every event from a write — they arrive as
 * separate tasks after it — lands in the same burst; short enough that a heart
 * tapped on screen fills on the next frame but one.
 */
const COALESCE_MS = 16;

const batcher = createChangeBatcher((flush) => {
  setTimeout(flush, COALESCE_MS);
});

/*
 * One native listener for the app, installed on first use, never removed.
 * Drizzle's hook added one per mounted query; with twenty queries live that
 * was twenty JS callbacks per changed row before any of them did anything.
 */
let listening = false;

function listen(): void {
  if (listening) return;
  listening = true;
  addDatabaseChangeListener(({ tableName }) => batcher.changed(tableName));
}

/** The part of a Drizzle select this needs: run it, synchronously. */
export interface LiveSelect<Row> {
  all: () => Row[];
}

export interface LiveResult<Row> {
  data: Row[];
  /** Undefined until the first result, so "empty" and "not read yet" differ. */
  updatedAt: Date | undefined;
  error: Error | undefined;
}

/**
 * A query result that follows the database.
 *
 * Replaces Drizzle's `useLiveQuery`, keeping its shape — `data` starts empty,
 * `updatedAt` marks the first result — and changing what makes it re-run.
 * Drizzle's re-ran on every changed row; this re-runs once per burst of
 * changes, through `changeBatcher`. See that file for the measurements.
 *
 * Watches the table in `FROM`, as Drizzle's did, plus any in `watch`. The
 * second argument exists because the first rule was a trap that has been
 * documented in four separate places in this codebase: a joined table is
 * invisible, so a list joined to `track_stats` never noticed a heart.
 *
 * The query runs synchronously — Drizzle on expo-sqlite always did, behind a
 * promise — so calling `all()` directly only drops the microtask hop.
 *
 * A null query is a query not needed right now: nothing runs and nothing is
 * watched, and the last result is kept for when it is needed again. That is
 * how a filter's lookup costs nothing while the filter is off, without a
 * component split just to make a hook conditional.
 */
export function useLiveQuery<Row>(
  query: LiveSelect<Row> | null,
  deps: readonly unknown[] = [],
  watch: readonly SQLiteTable[] = [],
): LiveResult<Row> {
  const [state, setState] = useState<LiveResult<Row>>({
    data: [],
    updatedAt: undefined,
    error: undefined,
  });

  useEffect(() => {
    if (query === null) return;

    const run = (): void => {
      try {
        const data = query.all();
        setState({ data, updatedAt: new Date(), error: undefined });
      } catch (error) {
        setState((previous) => ({ ...previous, error: asError(error) }));
      }
    };

    run();
    listen();
    return batcher.subscribe(tablesOf(query, watch), run);
    // The query is rebuilt every render; `deps` says when it means something
    // different, exactly as with the hook this replaces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

function tablesOf(query: LiveSelect<unknown>, watch: readonly SQLiteTable[]): string[] {
  const names = new Set(watch.map((table) => getTableConfig(table).name));
  const from = (query as { config?: { table?: unknown } }).config?.table;
  if (is(from, SQLiteTable)) names.add(getTableConfig(from).name);
  return [...names];
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
