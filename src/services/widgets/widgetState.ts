import type { WidgetCollection, WidgetNowPlaying, WidgetQueueRow } from 'mufify-widgets';

import type { PlaybackState, PlayableTrack } from '@/services/audio/types';

/** The most the tallest now-playing widget lists. */
export const UP_NEXT_ROWS = 4;

/** Which collection a widget starts. The string form is what the widget stores. */
export type CollectionKey = { kind: 'library' } | { kind: 'liked' } | { kind: 'playlist'; id: number };

/** Everything a widget button can ask for. */
export type WidgetAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'jump'; index: number; trackId: number }
  | { type: 'playCollection' | 'shuffleCollection'; collection: CollectionKey };

/**
 * What the now-playing widget shows, from the engine's queue and state.
 *
 * Built from the queue rather than `state.track` so the rows under it and the
 * track above them come from one snapshot — they cannot disagree about where
 * the queue is. "Loading" counts as playing: the press that started it is
 * already answered, and a play icon there would invite pressing it again.
 */
export function nowPlayingSnapshot(
  queue: { tracks: readonly PlayableTrack[]; index: number },
  state: Pick<PlaybackState, 'phase'>,
  unknownArtist: string,
  rows = UP_NEXT_ROWS,
): WidgetNowPlaying {
  const current = queue.index >= 0 ? queue.tracks[queue.index] : undefined;
  if (current === undefined) {
    return { hasTrack: false, title: '', artist: '', artworkPath: null, playing: false, upNext: [] };
  }

  const upNext: WidgetQueueRow[] = queue.tracks
    .slice(queue.index + 1, queue.index + 1 + rows)
    .map((track, offset) => ({
      index: queue.index + 1 + offset,
      trackId: track.id,
      title: track.title,
      artist: track.artistName ?? unknownArtist,
    }));

  return {
    hasTrack: true,
    title: current.title,
    artist: current.artistName ?? unknownArtist,
    artworkPath: current.artworkPath,
    playing: state.phase === 'playing' || state.phase === 'loading',
    upNext,
  };
}

/** `library`, `liked`, `playlist:12`. */
export function collectionKeyOf(key: CollectionKey): string {
  return key.kind === 'playlist' ? `playlist:${key.id}` : key.kind;
}

/** The reverse. Null for anything a widget could not have stored. */
export function parseCollectionKey(value: unknown): CollectionKey | null {
  if (value === 'library' || value === 'liked') return { kind: value };
  if (typeof value !== 'string') return null;
  const match = /^playlist:(\d+)$/u.exec(value);
  return match ? { kind: 'playlist', id: Number(match[1]) } : null;
}

/**
 * A press from the native side, checked.
 *
 * The native side is ours, but what it hands over has been through
 * SharedPreferences and possibly an older build of the app; a shape this
 * version does not know is ignored, not guessed at.
 */
export function parseWidgetAction(raw: unknown): WidgetAction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { type, collection, index, trackId } = raw as Record<string, unknown>;
  switch (type) {
    case 'play':
    case 'pause':
    case 'next':
    case 'previous':
      return { type };
    case 'jump':
      return isWhole(index) && isWhole(trackId) ? { type, index, trackId } : null;
    case 'playCollection':
    case 'shuffleCollection': {
      const key = parseCollectionKey(collection);
      return key === null ? null : { type, collection: key };
    }
    default:
      return null;
  }
}

/**
 * Where a press on an up-next row should land, or -1 for nowhere.
 *
 * The row was drawn from the queue as it was, and a widget can be seconds or
 * hours stale: the track has played, the queue was reshuffled. The index wins
 * when it still holds that track; otherwise the next place the track appears
 * after the current one; otherwise nothing, rather than a jump to a song the
 * user did not press.
 */
export function resolveJump(
  queue: { tracks: readonly { id: number }[]; index: number },
  index: number,
  trackId: number,
): number {
  if (queue.tracks[index]?.id === trackId) return index;
  for (let at = Math.max(0, queue.index + 1); at < queue.tracks.length; at += 1) {
    if (queue.tracks[at]?.id === trackId) return at;
  }
  return -1;
}

/** A playlist as the collection list needs it. */
export interface CatalogPlaylist {
  id: number;
  name: string;
  trackCount: number;
  artworkPath: string | null;
}

/**
 * The collection widget's choices: the library, liked songs, then each
 * playlist in the order the Playlists tab shows them.
 *
 * The library carries no count. The number its tab shows is after hiding
 * duplicates, which is a pass over every row in JavaScript, and a cheaper
 * count of the table is a different number — the first version of this
 * widget said 3,471 above a library that said 3,428. No number is better
 * than a second, wrong one.
 */
export function widgetCollections(input: {
  libraryName: string;
  likedName: string;
  likedCount: number;
  playlists: readonly CatalogPlaylist[];
  trackCount: (count: number) => string;
}): WidgetCollection[] {
  const { libraryName, likedName, likedCount, playlists, trackCount } = input;
  return [
    { key: 'library', name: libraryName, meta: '', artworkPath: null, link: null },
    {
      key: 'liked',
      name: likedName,
      meta: trackCount(likedCount),
      artworkPath: null,
      link: 'playlist/-1',
    },
    ...playlists.map((playlist) => ({
      key: collectionKeyOf({ kind: 'playlist', id: playlist.id }),
      name: playlist.name,
      meta: trackCount(playlist.trackCount),
      artworkPath: playlist.artworkPath,
      link: `playlist/${playlist.id}`,
    })),
  ];
}

function isWhole(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
