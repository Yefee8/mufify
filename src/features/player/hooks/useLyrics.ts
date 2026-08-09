import { useEffect, useState } from 'react';

import AudioTagsModule from 'audio-tags';
import { parseLyrics, type Lyrics } from '@/services/lyrics/parseLyrics';

/**
 * The lyrics embedded in the current track, read on demand.
 *
 * Not stored in the database, and not read by the scanner. A library's worth
 * of lyrics is megabytes of text to answer a question the player only ever
 * asks about one track, and the read itself is cheap — only the metadata at
 * the head of the file, which is a few kilobytes before the audio starts.
 *
 * `null` lyrics with a settled status is the answer for most tracks, and the
 * player uses it to decide whether the button exists at all.
 */
export type LyricsStatus = 'idle' | 'loading' | 'ready';

export interface LyricsResult {
  lyrics: Lyrics | null;
  status: LyricsStatus;
}

/**
 * Parsed lyrics by track id.
 *
 * Module level so flipping between the artwork and the words, or coming back
 * to a track later in the queue, does not open the file again. Bounded because
 * a long shuffle through a large library would otherwise hold every lyric it
 * has ever seen — this is a cache, not a store.
 */
const cache = new Map<number, Lyrics | null>();
const CACHE_LIMIT = 32;

function remember(trackId: number, lyrics: Lyrics | null): void {
  if (cache.size >= CACHE_LIMIT) {
    // Oldest first; `Map` iterates in insertion order.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(trackId, lyrics);
}

/** What a finished read produced, kept only to re-render when it lands. */
interface Loaded {
  trackId: number;
  lyrics: Lyrics | null;
}

export function useLyrics(trackId: number | null, uri: string | null): LyricsResult {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (trackId === null || uri === null) return;
    // Already answered; the render below reads it straight from the cache.
    if (cache.has(trackId)) return;

    // The track can change while the file is being read; a late answer for a
    // track that is no longer current must not be shown against the new one.
    let current = true;

    AudioTagsModule.readLyrics(uri)
      .then((raw) => parseLyrics(raw))
      // A file that cannot be read has no lyrics, which is the same outcome
      // for the screen as a file that carries none.
      .catch(() => null)
      .then((parsed) => {
        remember(trackId, parsed);
        if (current) setLoaded({ trackId, lyrics: parsed });
      });

    return () => {
      current = false;
    };
  }, [trackId, uri]);

  /*
   * Derived at render rather than mirrored into state by an effect. The cache
   * is the answer whenever it has one, and `loaded` exists only to make the
   * render happen when an async read fills it in.
   */
  if (trackId === null || uri === null) return { lyrics: null, status: 'idle' };

  const cached = cache.get(trackId);
  if (cached !== undefined) return { lyrics: cached, status: 'ready' };
  if (loaded !== null && loaded.trackId === trackId) {
    return { lyrics: loaded.lyrics, status: 'ready' };
  }
  return { lyrics: null, status: 'loading' };
}
