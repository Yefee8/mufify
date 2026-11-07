import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { runOnUI } from 'react-native-reanimated';

import { movePlaylistEntry, type PlaylistEntry } from '@/db/queries/playlists';
import { moveItem } from '@/services/playlists/order';

import { finishDrop } from '../reorderDrag';

export interface ReorderableEntries {
  /** The order to render: the query's, or the drop the user just made. */
  entries: PlaylistEntry[];

  /** Commit a drag, by index into `entries`. */
  move: (from: number, to: number) => void;
}

/**
 * A playlist's entries, with a dropped row already in its new place.
 *
 * The drag moves pixels and the database decides the order, so between letting
 * go and the write landing there is a gap of a frame or several. Without this
 * the list spends that gap rendering the *old* order: the row snaps back to
 * where it was picked up, and then jumps forward when the query re-runs. It is
 * the worst-looking part of a drag, and it gets worse on a long playlist, where
 * the write takes longer.
 *
 * So the new order is shown the moment the finger lifts and the query result
 * replaces it as soon as it arrives. `useLiveQuery` re-emits only when the
 * table changes, which is what makes arrival a usable signal: a new array means
 * new truth, and the copy is keyed on the old one.
 *
 * Whatever the query says wins, even when it disagrees with the drop. If the
 * write was rejected, or the playlist changed underneath, or a rescan marked a
 * file missing, the optimistic copy is hiding the truth — so it lasts exactly
 * until the next result and not a frame longer.
 */
export function useReorderableEntries(
  playlistId: number,
  entries: PlaylistEntry[],
): ReorderableEntries {
  /*
   * Keyed by the query result it was derived from, so it expires by itself.
   *
   * No effect clearing it, and no comparing orders: when `useLiveQuery` emits,
   * `entries` is a new array, the key no longer matches and the copy is simply
   * not used again. An effect calling `setState` would be a second render pass
   * for something already decidable here — and the compiler's lint says so.
   */
  const [pending, setPending] = useState<{ of: PlaylistEntry[]; order: PlaylistEntry[] } | null>(
    null,
  );
  const shown = pending !== null && pending.of === entries ? pending.order : entries;

  /*
   * The drop is finished when the reordered list has been *committed*, not
   * when it was asked for.
   *
   * During a drag the rows stand in their new places by Reanimated transforms,
   * computed on the UI thread; the new order arrives as a React layout from the
   * JS thread. Resetting the transforms before that layout lands showed the old
   * order for as long as the JS thread took to render — the row jumped back to
   * where it was picked up, then forward to where it was put, which on a
   * mid-range phone was a visible teleport. So the reset waits for the commit:
   * a layout effect on the shown order runs right after it, and the reset is
   * sent straight to the UI thread rather than written from JS, which would
   * cost it another hop on the way.
   *
   * Making the two land in literally the same frame is not something either
   * library offers — rendering the commit without the animated style was tried
   * and measured, and a detached Reanimated style keeps its last transform on
   * the native view. See `docs/adr/031-a-drop-that-stays-put.md`.
   */
  const landing = useRef(false);
  useLayoutEffect(() => {
    if (!landing.current) return;
    landing.current = false;
    runOnUI(finishDrop)();
  }, [shown]);

  const move = useCallback(
    (from: number, to: number) => {
      const next = moveItem(shown, from, to);
      const fromPosition = shown[from]?.position;
      const toPosition = shown[to]?.position;
      if (next === null || fromPosition === undefined || toPosition === undefined) {
        // The list changed under the drag and the indices no longer mean
        // anything. Nothing is committed, so nothing else will release the
        // drag — leaving it would strand the rows in their shifted slots.
        finishDrop();
        return;
      }

      landing.current = true;
      setPending({ of: entries, order: next });
      // Positions, not row numbers: the list hides missing tracks and the table
      // does not. See `movePlaylistEntry`.
      void movePlaylistEntry(playlistId, fromPosition, toPosition);
    },
    [entries, playlistId, shown],
  );

  return { entries: shown, move };
}
