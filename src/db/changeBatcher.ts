/**
 * Row changes, gathered into one notification per burst.
 *
 * SQLite's update hook reports every row a write touches, one event each. A
 * scan batch of 500 tracks is 500 events; recording one listen is a play event,
 * a stats row and a rollup per entity and period — two dozen. Each live query
 * used to re-run on every one of them, synchronously on the JS thread, so the
 * 500-row batch re-ran the whole track list 500 times. Measured on the emulator
 * with 3,000 tracks, that kept the JS thread at 100% for minutes after a scan
 * had finished writing, and a page opened in that time waited behind it.
 *
 * What a subscriber needs to know is "something in my tables changed since I
 * last looked", once. So events only mark a table dirty, and one flush shortly
 * afterwards runs each affected subscriber a single time, however many rows
 * changed and however many of its tables they were in.
 *
 * Pure and timer-agnostic: the caller supplies `schedule`, so the batching can
 * be tested without a clock.
 */
export interface ChangeBatcher {
  /** A row in `table` was inserted, updated or deleted. */
  changed: (table: string) => void;
  /**
   * Call `listener` once per burst in which any of `tables` changed.
   * Returns the unsubscribe.
   */
  subscribe: (tables: readonly string[], listener: () => void) => () => void;
}

export function createChangeBatcher(schedule: (flush: () => void) => void): ChangeBatcher {
  const byTable = new Map<string, Set<() => void>>();
  const dirty = new Set<string>();
  let pending = false;

  const flush = (): void => {
    pending = false;
    const due = new Set<() => void>();
    for (const table of dirty) {
      const listeners = byTable.get(table);
      if (listeners !== undefined) for (const listener of listeners) due.add(listener);
    }
    dirty.clear();
    // Checked again at call time: a listener can unsubscribe another one, and
    // a screen that unmounted mid-flush must not be handed a result.
    for (const listener of due) {
      if (isSubscribed(byTable, listener)) listener();
    }
  };

  return {
    changed(table) {
      // Nobody is watching this table, so there is nothing to wake.
      if (!byTable.has(table)) return;
      dirty.add(table);
      if (pending) return;
      pending = true;
      schedule(flush);
    },

    subscribe(tables, listener) {
      for (const table of tables) {
        let listeners = byTable.get(table);
        if (listeners === undefined) {
          listeners = new Set();
          byTable.set(table, listeners);
        }
        listeners.add(listener);
      }

      return () => {
        for (const table of tables) {
          const listeners = byTable.get(table);
          if (listeners === undefined) continue;
          listeners.delete(listener);
          if (listeners.size === 0) byTable.delete(table);
        }
      };
    },
  };
}

function isSubscribed(byTable: Map<string, Set<() => void>>, listener: () => void): boolean {
  for (const listeners of byTable.values()) if (listeners.has(listener)) return true;
  return false;
}
