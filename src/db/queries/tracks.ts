import { and, asc, count, eq, isNull, like, or, sql } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect } from 'react';

import * as perf from '@/services/perf';

import { db } from '../client';
import { useThrottledData } from '../useThrottledData';
import { albums, artists, trackStats, tracks, type NewTrack } from '../schema';

/** A track with its artist and album names resolved, ready for a list row. */
export interface TrackListItem {
  id: number;
  /**
   * Selected even though no row renders it: tapping a row starts playback, and
   * fetching the URI at that moment would put a database round trip between
   * the tap and the sound.
   */
  fileUri: string;
  title: string;
  artistName: string | null;
  albumName: string | null;
  durationMs: number;
  artworkPath: string | null;
  /**
   * Lifetime plays, for the discovery shuffle. Zero when the track has never
   * been played, since `track_stats` only gains a row on the first listen.
   */
  playCount: number;
  /** Marked by the user. The `favorites` shuffle weights on it. */
  isFavorite: boolean;
}

const listSelection = {
  id: tracks.id,
  fileUri: tracks.fileUri,
  title: tracks.title,
  artistName: artists.name,
  albumName: albums.name,
  durationMs: tracks.durationMs,
  artworkPath: tracks.artworkPath,
  playCount: sql<number>`coalesce(${trackStats.playCount}, 0)`,
  /*
   * `mapWith(Boolean)` rather than a bare `sql<boolean>`: SQLite has no boolean
   * type and hands back 0 or 1, so the annotation alone would be a type that
   * lies. It survives `if (isFavorite)` and breaks the moment anyone writes
   * `=== true`, which is the worst kind of wrong — right until it isn't.
   */
  isFavorite: sql`coalesce(${trackStats.isFavorite}, 0)`.mapWith(Boolean),
};

/** Present tracks, alphabetical, case-insensitive. */
export function listTracks(limit = 100, offset = 0) {
  return db
    .select(listSelection)
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(trackStats, eq(trackStats.trackId, tracks.id))
    .where(eq(tracks.isMissing, 0))
    .orderBy(asc(sql`${tracks.title} COLLATE NOCASE`))
    .limit(limit)
    .offset(offset);
}

/** Title, artist or album — the search box matches all three. */
export function searchTracks(term: string, limit = 100) {
  const pattern = `%${term}%`;
  return db
    .select(listSelection)
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(trackStats, eq(trackStats.trackId, tracks.id))
    .where(
      and(
        eq(tracks.isMissing, 0),
        or(like(tracks.title, pattern), like(artists.name, pattern), like(albums.name, pattern)),
      ),
    )
    .orderBy(asc(sql`${tracks.title} COLLATE NOCASE`))
    .limit(limit);
}

export async function getTrackById(id: number) {
  const [row] = await db.select().from(tracks).where(eq(tracks.id, id)).limit(1);
  return row ?? null;
}

export async function countTracks(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(tracks).where(eq(tracks.isMissing, 0));
  return row?.value ?? 0;
}

/**
 * The live track list, re-running whenever the table changes.
 *
 * Same `isMissing = 0` predicate as `useTrackCount`, deliberately: the header
 * count and the rows below it must come from one definition of "present", or
 * the screen reports a number it cannot show. `LIST_SELECTION` and the shared
 * `where` exist so that stays true by construction rather than by review.
 *
 * `useLiveQuery` lives here rather than in a feature hook so Drizzle stays
 * behind the src/db boundary, which ESLint enforces.
 */
export function useTracks(search = ''): { tracks: TrackListItem[]; isLoading: boolean } {
  const term = search.trim();
  // `%` and `_` are LIKE wildcards. Unescaped, typing "%" matches everything
  // and the list appears not to filter at all.
  const pattern = `%${term.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;

  const query = db
    .select(listSelection)
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(trackStats, eq(trackStats.trackId, tracks.id))
    .where(
      term
        ? and(
            eq(tracks.isMissing, 0),
            or(
              sql`${tracks.title} LIKE ${pattern} ESCAPE '\\'`,
              sql`${artists.name} LIKE ${pattern} ESCAPE '\\'`,
              sql`${albums.name} LIKE ${pattern} ESCAPE '\\'`,
            ),
          )
        : eq(tracks.isMissing, 0),
    )
    .orderBy(asc(sql`${tracks.title} COLLATE NOCASE`));

  const { data, updatedAt } = useLiveQuery(query, [term]);

  /*
   * Time to first rows, which is the number the cold-start investigation turned
   * on. The per-render counter that used to sit here was removed: on the Mi 9T
   * it fired often enough that MIUI's logcat rate limiter discarded this
   * measurement, and a probe that hides the thing it is measuring is worse than
   * no probe.
   */
  useEffect(() => {
    perf.mark('useTracks.firstRows');
  }, [term]);
  useEffect(() => {
    if (updatedAt !== undefined) perf.measure('useTracks.firstRows', data.length);
  }, [updatedAt, data.length]);

  // `updatedAt` is undefined until the first result lands. Without it an empty
  // library and a library that has not been read yet are the same value, and
  // the screen flashes its empty state before the rows arrive.
  return { tracks: useThrottledData(data), isLoading: updatedAt === undefined };
}

/**
 * The technical strip for one track.
 *
 * Queried on demand rather than carried on `PlayableTrack`: it is seven more
 * columns that only one screen reads, and the queue holds the whole library.
 * Nullable throughout — below API 31 the retriever reports no sample rate or
 * bit depth, and stage two may not have reached this row yet.
 */
export function useTrackSpec(trackId: number | null) {
  const query = db
    .select({
      container: tracks.container,
      codec: tracks.codec,
      bitrateKbps: tracks.bitrateKbps,
      sampleRateHz: tracks.sampleRateHz,
      bitDepth: tracks.bitDepth,
      channels: tracks.channels,
      fileSize: tracks.fileSize,
    })
    .from(tracks)
    .where(eq(tracks.id, trackId ?? -1))
    .limit(1);

  const { data } = useLiveQuery(query, [trackId]);
  return data[0] ?? null;
}

/**
 * The library query, run once and awaited. Development measurement only.
 *
 * Exactly what `useTracks` runs, so timing this and timing that are comparable.
 * It exists because the two numbers turned out to be wildly different, and the
 * gap is the interesting part rather than either figure on its own.
 */
export function timeLibraryQuery() {
  return db
    .select(listSelection)
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(trackStats, eq(trackStats.trackId, tracks.id))
    .where(eq(tracks.isMissing, 0))
    .orderBy(asc(sql`${tracks.title} COLLATE NOCASE`));
}

/**
 * Whether one track is favourited, live.
 *
 * Separate from `useTracks` because the player has a track id and no list. It
 * reads `track_stats`, which is absent until the first listen — no row means
 * not favourited, which is why the query cannot be an inner join.
 */
export function useIsFavorite(trackId: number | null): boolean {
  const query = db
    .select({ isFavorite: trackStats.isFavorite })
    .from(trackStats)
    .where(eq(trackStats.trackId, trackId ?? -1))
    .limit(1);

  const { data } = useLiveQuery(query, [trackId]);
  return data[0]?.isFavorite === 1;
}

/**
 * Mark or unmark a favourite.
 *
 * Upserts because `track_stats` only gains a row on the first listen, and a
 * track can be favourited before it has ever been played — which is exactly
 * what someone does after adding an album they already know.
 */
export async function setFavorite(trackId: number, isFavorite: boolean): Promise<void> {
  const flag = isFavorite ? 1 : 0;
  const favoriteAt = isFavorite ? Date.now() : null;
  await db
    .insert(trackStats)
    .values({ trackId, isFavorite: flag, favoriteAt })
    .onConflictDoUpdate({ target: trackStats.trackId, set: { isFavorite: flag, favoriteAt } });
}

/**
 * Insert or update by `fileUri`, which is the stable identity of a track — a
 * rescan must not create a second row for a file it has already seen.
 */
export async function upsertTracks(rows: NewTrack[]): Promise<void> {
  if (rows.length === 0) return;

  await db
    .insert(tracks)
    .values(rows)
    .onConflictDoUpdate({
      target: tracks.fileUri,
      set: {
        title: sql`excluded.title`,
        durationMs: sql`excluded.duration_ms`,
        dateModified: sql`excluded.date_modified`,
        fileSize: sql`excluded.file_size`,
        isMissing: sql`0`,
      },
    });
}

/**
 * A file that has gone is marked, never deleted, so playlist entries and play
 * history survive an unmounted SD card.
 */
export async function markMissing(trackIds: number[]): Promise<void> {
  if (trackIds.length === 0) return;
  await db
    .update(tracks)
    .set({ isMissing: 1 })
    .where(sql`${tracks.id} IN ${trackIds}`);
}

/** An artist or album as a card: cover, name, and how much of it there is. */
export interface CollectionCard {
  id: number;
  /** Null only for the reserved unknown artist or album card. */
  name: string | null;
  /** For an album, its artist. Null for an artist card. */
  subtitle: string | null;
  isUnknown: boolean;
  isUnknownSubtitle: boolean;
  trackCount: number;
  artworkPath: string | null;
}

/**
 * Every artist that has at least one present track.
 *
 * `innerJoin` rather than a left join from `artists`: the table accumulates a
 * row the first time a name is seen and nothing ever removes one, so an artist
 * whose only album has been deleted would otherwise sit in the list showing
 * zero tracks. What is on the device is what the library should show.
 *
 * The cover is `min(artwork_path)`, which is an arbitrary-but-stable choice of
 * one of the artist's covers. Stable matters more than which: a card whose
 * artwork changes between renders looks broken.
 */
export function useArtistCards(): CollectionCard[] {
  const collectionId = sql<number>`coalesce(${tracks.artistId}, 0)`;
  const query = db
    .select({
      id: collectionId,
      name: artists.name,
      subtitle: sql<string | null>`null`,
      isUnknown: sql`${tracks.artistId} IS NULL`.mapWith(Boolean),
      isUnknownSubtitle: sql`false`.mapWith(Boolean),
      trackCount: count(tracks.id),
      artworkPath: sql<string | null>`min(${tracks.artworkPath})`,
    })
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .where(eq(tracks.isMissing, 0))
    .groupBy(collectionId)
    .orderBy(asc(sql`coalesce(${artists.sortName}, '') COLLATE NOCASE`));

  const { data } = useLiveQuery(query);
  return useThrottledData(data);
}

/** Every album that has at least one present track. */
export function useAlbumCards(): CollectionCard[] {
  const collectionId = sql<number>`coalesce(${tracks.albumId}, 0)`;
  const query = db
    .select({
      id: collectionId,
      name: albums.name,
      subtitle: artists.name,
      isUnknown: sql`${tracks.albumId} IS NULL`.mapWith(Boolean),
      isUnknownSubtitle: sql`${tracks.albumId} IS NOT NULL AND ${albums.artistId} IS NULL`.mapWith(
        Boolean,
      ),
      trackCount: count(tracks.id),
      artworkPath: sql<string | null>`min(${tracks.artworkPath})`,
    })
    .from(tracks)
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(artists, eq(artists.id, albums.artistId))
    .where(eq(tracks.isMissing, 0))
    .groupBy(collectionId)
    .orderBy(asc(sql`coalesce(${albums.name}, '') COLLATE NOCASE`));

  const { data } = useLiveQuery(query);
  return useThrottledData(data);
}

/**
 * The tracks of one artist or album, ready to play.
 *
 * Ordered by disc and track number where they exist, falling back to title —
 * an album played in alphabetical order is not the album. Nulls sort last so a
 * partially-tagged record still opens with the tracks that know where they go.
 */
export function useCollectionTracks(kind: 'artist' | 'album', id: number): TrackListItem[] {
  const collectionPredicate =
    kind === 'artist'
      ? id === 0
        ? isNull(tracks.artistId)
        : eq(tracks.artistId, id)
      : id === 0
        ? isNull(tracks.albumId)
        : eq(tracks.albumId, id);
  const query = db
    .select(listSelection)
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(trackStats, eq(trackStats.trackId, tracks.id))
    .where(and(eq(tracks.isMissing, 0), collectionPredicate))
    .orderBy(
      asc(sql`${tracks.discNo} IS NULL`),
      asc(tracks.discNo),
      asc(sql`${tracks.trackNo} IS NULL`),
      asc(tracks.trackNo),
      asc(sql`${tracks.title} COLLATE NOCASE`),
    );

  const { data } = useLiveQuery(query, [kind, id]);
  return useThrottledData(data);
}
