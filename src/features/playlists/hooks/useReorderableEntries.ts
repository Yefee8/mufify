import { useCallback, useState } from 'react';

import { movePlaylistEntry, type PlaylistEntry } from '@/db/queries/playlists';
import { moveItem } from '@/services/playlists/order';

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

  const move = useCallback(
    (from: number, to: number) => {
      const next = moveItem(shown, from, to);
      const fromPosition = shown[from]?.position;
      const toPosition = shown[to]?.position;
      if (next === null || fromPosition === undefined || toPosition === undefined) return;

      setPending({ of: entries, order: next });
      // Positions, not row numbers: the list hides missing tracks and the table
      // does not. See `movePlaylistEntry`.
      void movePlaylistEntry(playlistId, fromPosition, toPosition);
    },
    [entries, playlistId, shown],
  );

  return { entries: shown, move };
}
