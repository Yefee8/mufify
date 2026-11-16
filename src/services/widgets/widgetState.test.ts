import type { PlayableTrack } from '@/services/audio/types';

import {
  collectionKeyOf,
  nowPlayingSnapshot,
  parseCollectionKey,
  parseWidgetAction,
  resolveJump,
  UP_NEXT_ROWS,
  widgetCollections,
} from './widgetState';

function track(id: number, artistName: string | null = `Artist ${id}`): PlayableTrack {
  return {
    id,
    uri: `content://media/external/audio/media/${id}`,
    title: `Track ${id}`,
    artistName,
    albumName: null,
    durationMs: 1000,
    artworkPath: id % 2 === 0 ? `/files/artwork/${id}.jpg` : null,
    playCount: 0,
    isFavorite: false,
  };
}

const queue = (ids: number[], index: number) => ({ tracks: ids.map((id) => track(id)), index });

describe('nowPlayingSnapshot', () => {
  it('is empty with no current track', () => {
    expect(nowPlayingSnapshot(queue([], -1), { phase: 'idle' }, '?').hasTrack).toBe(false);
    // Stopped keeps the queue but has no current track.
    expect(nowPlayingSnapshot(queue([1, 2], -1), { phase: 'idle' }, '?').hasTrack).toBe(false);
  });

  it('lists what follows the current track, never more than the widget can show', () => {
    const snapshot = nowPlayingSnapshot(queue([1, 2, 3, 4, 5, 6, 7, 8], 1), { phase: 'playing' }, '?');
    expect(snapshot.title).toBe('Track 2');
    expect(snapshot.artworkPath).toBe('/files/artwork/2.jpg');
    expect(snapshot.upNext).toHaveLength(UP_NEXT_ROWS);
    // Every row names the queue position it was drawn from, and what was there.
    for (const row of snapshot.upNext) {
      expect(row.title).toBe(`Track ${row.trackId}`);
      expect(row.index).toBe(row.trackId - 1);
    }
  });

  it('runs out at the end of the queue rather than wrapping', () => {
    expect(nowPlayingSnapshot(queue([1, 2, 3], 2), { phase: 'paused' }, '?').upNext).toEqual([]);
  });

  it('counts loading as playing, and names the unknown artist', () => {
    const snapshot = nowPlayingSnapshot(
      { tracks: [track(1, null), track(2, null)], index: 0 },
      { phase: 'loading' },
      'Unknown artist',
    );
    expect(snapshot.playing).toBe(true);
    expect(snapshot.artist).toBe('Unknown artist');
    expect(snapshot.upNext[0]?.artist).toBe('Unknown artist');
    expect(nowPlayingSnapshot(queue([1], 0), { phase: 'paused' }, '?').playing).toBe(false);
  });
});

describe('collection keys', () => {
  it('round-trip', () => {
    for (const key of [
      { kind: 'library' },
      { kind: 'liked' },
      { kind: 'playlist', id: 12 },
    ] as const) {
      expect(parseCollectionKey(collectionKeyOf(key))).toEqual(key);
    }
  });

  it('refuse what no widget could have stored', () => {
    for (const value of ['', 'playlist:', 'playlist:-1', 'playlist:1.5', 'album:3', null, 3]) {
      expect(parseCollectionKey(value)).toBeNull();
    }
  });
});

describe('parseWidgetAction', () => {
  it('reads every press a widget can make', () => {
    expect(parseWidgetAction({ type: 'pause', collection: null, index: -1, trackId: -1 })).toEqual({
      type: 'pause',
    });
    expect(parseWidgetAction({ type: 'jump', index: 4, trackId: 99 })).toEqual({
      type: 'jump',
      index: 4,
      trackId: 99,
    });
    expect(parseWidgetAction({ type: 'shuffleCollection', collection: 'playlist:7' })).toEqual({
      type: 'shuffleCollection',
      collection: { kind: 'playlist', id: 7 },
    });
  });

  it('ignores shapes this build does not know', () => {
    for (const raw of [
      null,
      'play',
      { type: 'eject' },
      { type: 'jump', index: -1, trackId: 3 },
      { type: 'playCollection', collection: 'album:2' },
    ]) {
      expect(parseWidgetAction(raw)).toBeNull();
    }
  });
});

describe('resolveJump', () => {
  const current = { tracks: [10, 20, 30, 20, 40].map((id) => ({ id })), index: 1 };

  it('keeps the index while it still holds the track', () => {
    expect(resolveJump(current, 3, 20)).toBe(3);
  });

  it('follows the track when the queue moved, looking only ahead', () => {
    // Track 30 was drawn at 4; it is now at 2, after the current track.
    expect(resolveJump(current, 4, 30)).toBe(2);
    // Track 10 is behind the current track: not where a row of "up next" points.
    expect(resolveJump(current, 4, 10)).toBe(-1);
  });

  it('goes nowhere when the track has left the queue', () => {
    expect(resolveJump(current, 2, 77)).toBe(-1);
  });
});

describe('widgetCollections', () => {
  it('lists the library, liked songs, then the playlists in their order', () => {
    const list = widgetCollections({
      libraryName: 'Library',
      likedName: 'Liked songs',
      likedCount: 1,
      playlists: [
        { id: 4, name: 'Late', trackCount: 3, artworkPath: '/c/4.jpg' },
        { id: 2, name: 'Early', trackCount: 0, artworkPath: null },
      ],
      trackCount: (count) => `${count} tracks`,
    });
    expect(list.map((entry) => entry.key)).toEqual(['library', 'liked', 'playlist:4', 'playlist:2']);
    // The library's own count is after hiding duplicates; no second number.
    expect(list[0]).toMatchObject({ meta: '', link: null });
    expect(list[1]?.link).toBe('playlist/-1');
    expect(list[2]).toEqual({
      key: 'playlist:4',
      name: 'Late',
      meta: '3 tracks',
      artworkPath: '/c/4.jpg',
      link: 'playlist/4',
    });
  });
});
