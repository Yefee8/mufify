import { useCallback, useMemo, useState } from 'react';

export interface Selection {
  /** True while the list is in selection mode, even with nothing ticked. */
  isSelecting: boolean;
  /** Which ids are ticked. Empty outside selection mode. */
  selected: ReadonlySet<number>;
  /** Enter selection mode with one thing already ticked. */
  begin: (id: number) => void;
  toggle: (id: number) => void;
  /** Tick everything currently listed, or clear it if all of it is ticked. */
  toggleAll: (ids: readonly number[]) => void;
  /** Leave selection mode entirely. */
  end: () => void;
}

/**
 * Which rows are ticked, and whether anything is.
 *
 * Selection mode and the set of selected ids are one piece of state, not two.
 * Held separately they drift: unticking the last row leaves a mode with an
 * empty set — a list that no longer plays when tapped and shows a bar with
 * nothing to act on — and every screen using it has to remember to close the
 * mode by hand. `null` means not selecting; a set means selecting, and it may
 * legitimately be empty while the user unticks and re-ticks.
 *
 * Leaving is always explicit. An earlier shape exited automatically at zero
 * selected, which turned "I unticked the wrong one" into "the whole mode
 * vanished and the next tap started playing music".
 */
export function useSelection(): Selection {
  const [selected, setSelected] = useState<ReadonlySet<number> | null>(null);

  const begin = useCallback((id: number) => setSelected(new Set([id])), []);

  const end = useCallback(() => setSelected(null), []);

  const toggle = useCallback((id: number) => {
    setSelected((current) => {
      const next = new Set(current ?? []);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: readonly number[]) => {
    setSelected((current) => {
      // "All" means all of what is *listed*, which the search box and the liked
      // filter both narrow — so this compares against what is on screen rather
      // than against the library.
      const all = current !== null && ids.every((id) => current.has(id));
      return all ? new Set() : new Set(ids);
    });
  }, []);

  return useMemo(
    () => ({
      isSelecting: selected !== null,
      selected: selected ?? EMPTY,
      begin,
      toggle,
      toggleAll,
      end,
    }),
    [selected, begin, toggle, toggleAll, end],
  );
}

/** One shared empty set, so `selected` keeps its identity between renders. */
const EMPTY: ReadonlySet<number> = new Set();
