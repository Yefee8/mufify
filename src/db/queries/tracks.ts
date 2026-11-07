import { and, asc, count, desc, eq, inArray, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useMemo } from 'react';

import { dedupeTracks } from '@/services/library/dedupeTracks';
import { useDuplicateSetting } from '@/services/library/duplicateSetting';
import {
  DEFAULT_ALBUM_SORT,
  DEFAULT_ARTIST_SORT,
  DEFAULT_TRACK_SORT,
  type AlbumSort,
  type ArtistSort,
  type SortDirection,
  type TrackSort,
} from '@/services/library/sortOrder';
import * as perf from '@/services/perf';

import { notifyUserDataChanged } from '../changes';
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
/** `asc` or `desc`, by the order's direction. */
function directed(direction: SortDirection, expression: SQL): SQL {
  return direction === 'asc' ? asc(expression) : desc(expression);
}

/**
 * Missing values last, whichever way the rest of the list runs.
 *
 * SQLite sorts NULL first ascending and last descending, which would put the
 * unknown artist at the top of A → Z and every untagged year at the top of
 * oldest-first. `x IS NULL` ascending is 0 before 1 in both directions, so it
 * leads the ORDER BY and the real values sort among themselves behind it.
 */
function nullsLast(expression: SQL): SQL {
  return asc(sql`${expression} IS NULL`);
}

const TITLE = sql`${tracks.title} COLLATE NOCASE`;
const ALBUM_NAME = sql`${albums.name} COLLATE NOCASE`;
const ARTIST_NAME = sql`${artists.sortName} COLLATE NOCASE`;

/** Disc, then track number, untagged last: the order an album is meant to be heard in. */
const RUNNING_ORDER: SQL[] = [
  nullsLast(sql`${tracks.discNo}`),
  asc(tracks.discNo),
  nullsLast(sql`${tracks.trackNo}`),
  asc(tracks.trackNo),
];

/**
 * `ORDER BY` for a list of tracks.
 *
 * In SQL rather than over the fetched array: a 10,000-track library sorted in
 * JavaScript with a locale collator costs tens of milliseconds on every change
 * of the list, on the JS thread, and the database does it as part of a query it
 * is running anyway.
 *
 * Each key carries tiebreakers. Sorting by artist and stopping there would
 * leave each artist's tracks in whatever order the table happened to hold them;
 * by artist the list reads album by album in running order, by year the same
 * within each year, and every key ends on the title so equal rows never shuffle
 * between renders.
 */
function trackOrderBy(sort: TrackSort): SQL[] {
  const { key, direction } = sort;
  switch (key) {
    case 'title':
      return [directed(direction, TITLE)];
    case 'artist':
      return [
        nullsLast(sql`${artists.name}`),
        directed(direction, ARTIST_NAME),
        nullsLast(sql`${albums.name}`),
        asc(ALBUM_NAME),
        ...RUNNING_ORDER,
        asc(TITLE),
      ];
    case 'album':
      return [
        nullsLast(sql`${albums.name}`),
        directed(direction, ALBUM_NAME),
        ...RUNNING_ORDER,
        asc(TITLE),
      ];
    case 'year':
      return [
        nullsLast(sql`${tracks.year}`),
        directed(direction, sql`${tracks.year}`),
        asc(ALBUM_NAME),
        ...RUNNING_ORDER,
        asc(TITLE),
      ];
    case 'dateAdded':
      return [directed(direction, sql`${tracks.dateAdded}`), asc(TITLE)];
  }
}

export function useTracks(
  search = '',
  likedOnly = false,
  sort: TrackSort = DEFAULT_TRACK_SORT,
): { tracks: TrackListItem[]; isLoading: boolean } {
  const term = search.trim();
  // `%` and `_` are LIKE wildcards. Unescaped, typing "%" matches everything
  // and the list appears not to filter at all.
  const pattern = `%${term.replace(/[\\%_]/gu, (char) => `\\${char}`)}%`;

  const matches = term
    ? and(
        eq(tracks.isMissing, 0),
        or(
          sql`${tracks.title} LIKE ${pattern} ESCAPE '\\'`,
          sql`${artists.name} LIKE ${pattern} ESCAPE '\\'`,
          sql`${albums.name} LIKE ${pattern} ESCAPE '\\'`,
        ),
      )
    : eq(tracks.isMissing, 0);

  /*
   * Two queries rather than one with an extra predicate, and the difference
   * that matters is which table they select **from**.
   *
   * `useLiveQuery` only watches the table in `FROM` — it reads
   * `query.config.table` and compares that one name, so a joined table is
   * invisible to it. Liking a track writes to `track_stats` and nothing else,
   * so a filtered list built `from(tracks)` would show whatever was liked when
   * it mounted and never notice a heart being tapped. `useFavoriteEntries` is
   * built the same way for the same reason, and the bug it documents is the
   * one this avoids.
   *
   * The inner join is also what applies the filter: a track with no
   * `track_stats` row has never been liked, so there is nothing to match.
   */
  const query = likedOnly
    ? db
        .select(listSelection)
        .from(trackStats)
        .innerJoin(tracks, eq(tracks.id, trackStats.trackId))
        .leftJoin(artists, eq(tracks.artistId, artists.id))
        .leftJoin(albums, eq(tracks.albumId, albums.id))
        .where(and(eq(trackStats.isFavorite, 1), matches))
        .orderBy(...trackOrderBy(sort))
    : db
        .select(listSelection)
        .from(tracks)
        .leftJoin(artists, eq(tracks.artistId, artists.id))
        .leftJoin(albums, eq(tracks.albumId, albums.id))
        .leftJoin(trackStats, eq(trackStats.trackId, tracks.id))
        .where(matches)
        .orderBy(...trackOrderBy(sort));

  const { data, updatedAt } = useLiveQuery(query, [term, likedOnly, sort.key, sort.direction]);

  /*
   * Time to first rows, which is the number the cold-start investigation turned
   * on. The per-render counter that used to sit here was removed: on the Mi 9T
   * it fired often enough that MIUI's logcat rate limiter discarded this
   * measurement, and a probe that hides the thing it is measuring is worse than
   * no probe.
   */
  useEffect(() => {
    perf.mark('useTracks.firstRows');
  }, [term, likedOnly]);
  useEffect(() => {
    if (updatedAt !== undefined) perf.measure('useTracks.firstRows', data.length);
  }, [updatedAt, data.length]);

  /*
   * Duplicates are dropped here rather than in SQL, and after the throttle
   * rather than before it.
   *
   * In SQL because "almost the same title" is not something a query can express
   * — and after the throttle because the list this produces is what the header
   * counts and what Play and Shuffle enqueue. Deduping anywhere else would give
   * the screen a number and a queue that disagreed with its own rows.
   */
  const throttled = useThrottledData(data);
  const { hidden: hideDuplicates, match } = useDuplicateSetting();
  // Not named `tracks`: that is the schema table this file queries, and
  // shadowing it here detaches every column reference above from its table.
  const listed = useMemo(
    () => (hideDuplicates ? dedupeTracks(throttled, match) : throttled),
    [hideDuplicates, match, throttled],
  );

  // `updatedAt` is undefined until the first result lands. Without it an empty
  // library and a library that has not been read yet are the same value, and
  // the screen flashes its empty state before the rows arrive.
  return { tracks: listed, isLoading: updatedAt === undefined };
}

/**
 * The tracks in one collection, fetched once.
 *
 * The same predicate and ordering as `useCollectionTracks`, awaited rather than
 * subscribed. Deleting a whole album from the grid needs its contents at the
 * moment of the press and never again, and mounting a live query for that would
 * subscribe the *library* screen to every album the user long-presses.
 */
export async function listCollectionTracks(
  kind: 'artist' | 'album',
  id: number,
): Promise<TrackListItem[]> {
  return db
    .select(listSelection)
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(trackStats, eq(trackStats.trackId, tracks.id))
    .where(and(eq(tracks.isMissing, 0), collectionPredicate(kind, id)))
    .orderBy(asc(sql`${tracks.title} COLLATE NOCASE`));
}

/**
 * Which albums are liked, and when they were liked.
 *
 * A second live query rather than a join, and `from(albums)` is the point: this
 * is the one that watches the table the heart writes to, so tapping it refreshes
 * the grid. `useAlbumCards` has to stay `from(tracks)` — it groups by
 * `coalesce(album_id, 0)` so that tracks with no album still get a card, which
 * cannot be expressed from the album table.
 */
export function useFavoriteAlbumIds(): { id: number; favoriteAt: number | null }[] {
  const query = db
    .select({ id: albums.id, favoriteAt: albums.favoriteAt })
    .from(albums)
    .where(eq(albums.isFavorite, 1))
    .orderBy(desc(albums.favoriteAt), desc(albums.id));

  const { data } = useLiveQuery(query);
  return data;
}

/**
 * Like or unlike an album.
 *
 * `favoriteAt` is cleared on the way out rather than left behind, so an album
 * liked, unliked and liked again sorts by when it was *last* liked. A stale
 * timestamp would put it back where it used to be, which reads as the grid
 * ignoring the tap.
 */
export async function setAlbumFavorite(id: number, isFavorite: boolean): Promise<void> {
  // Id 0 is the reserved "no album" card, which is the absence of an album
  // rather than one. There is no row to write to.
  if (id === 0) return;
  await db
    .update(albums)
    .set({ isFavorite: isFavorite ? 1 : 0, favoriteAt: isFavorite ? Date.now() : null })
    .where(eq(albums.id, id));
  notifyUserDataChanged();
}

/**
 * Mark tracks whose files have been deleted from the device.
 *
 * Retired rather than deleted, which is the same thing a rescan does to a file
 * that has vanished — and the reason is the listening history. `play_events`
 * and `track_stats` are cascade children of `tracks`, so removing the row would
 * silently rewrite the statistics: a year's listening would lose whatever the
 * user tidied up last week, and the totals on the Wrapped screen would change
 * for reasons nobody could connect to deleting a file.
 *
 * Every list in the app already filters on `is_missing = 0`, so retiring is
 * what makes the track disappear from the library, from albums, and from the
 * playlists holding it. Should the same file ever come back, the scanner
 * un-retires the row it already has, along with everything attached to it.
 */
export async function retireTracks(ids: readonly number[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(tracks)
    .set({ isMissing: 1 })
    .where(inArray(tracks.id, [...ids]));
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
  notifyUserDataChanged();
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
  /**
   * Liked by the user. Albums only — an artist card has no row to write to,
   * and the reserved unknown card has no row at all.
   */
  isFavorite: boolean;
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
export function useArtistCards(sort: ArtistSort = DEFAULT_ARTIST_SORT): CollectionCard[] {
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
      // Artists are not likeable; the flag is here so one card type serves both.
      isFavorite: sql`false`.mapWith(Boolean),
    })
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .where(eq(tracks.isMissing, 0))
    .groupBy(collectionId)
    .orderBy(
      // The unknown artist last, not first: it is the one card nobody is
      // looking for, and coalescing it to '' used to sort it to the top.
      nullsLast(sql`${artists.name}`),
      ...(sort.key === 'dateAdded'
        ? [directed(sort.direction, sql`max(${tracks.dateAdded})`), asc(ARTIST_NAME)]
        : [directed(sort.direction, ARTIST_NAME)]),
    );

  const { data } = useLiveQuery(query, [sort.key, sort.direction]);
  return useThrottledData(data);
}

/**
 * The album shelf's `ORDER BY`, after the unknown album has been sent to the end.
 *
 * The year is the album's own tag where it has one and its newest track's
 * otherwise — plenty of rips tag the tracks and not the album. By artist, each
 * artist's albums run oldest first, which is how a discography is read.
 */
function albumOrderBy(sort: AlbumSort): SQL[] {
  const year = sql`coalesce(${albums.year}, max(${tracks.year}))`;
  switch (sort.key) {
    case 'name':
      return [directed(sort.direction, ALBUM_NAME)];
    case 'artist':
      return [
        nullsLast(sql`${artists.name}`),
        directed(sort.direction, ARTIST_NAME),
        nullsLast(year),
        asc(year),
        asc(ALBUM_NAME),
      ];
    case 'year':
      return [nullsLast(year), directed(sort.direction, year), asc(ALBUM_NAME)];
    case 'dateAdded':
      return [directed(sort.direction, sql`max(${tracks.dateAdded})`), asc(ALBUM_NAME)];
  }
}

/** Every album that has at least one present track. */
export function useAlbumCards(sort: AlbumSort = DEFAULT_ALBUM_SORT): CollectionCard[] {
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
      /*
       * Always false here, and filled in by `useFavoriteAlbumIds` above the
       * query rather than joined into it. `useLiveQuery` watches only the table
       * in `FROM`, which is `tracks` — liking an album writes to `albums` and
       * nothing else, so a joined flag would show whatever was liked when this
       * mounted and never notice a heart being tapped. The Playlists tab merges
       * two live queries for exactly this reason.
       */
      isFavorite: sql`false`.mapWith(Boolean),
    })
    .from(tracks)
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(artists, eq(artists.id, albums.artistId))
    .where(eq(tracks.isMissing, 0))
    .groupBy(collectionId)
    .orderBy(nullsLast(sql`${albums.name}`), ...albumOrderBy(sort));

  const { data } = useLiveQuery(query, [sort.key, sort.direction]);
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
  const query = db
    .select(listSelection)
    .from(tracks)
    .leftJoin(artists, eq(tracks.artistId, artists.id))
    .leftJoin(albums, eq(tracks.albumId, albums.id))
    .leftJoin(trackStats, eq(trackStats.trackId, tracks.id))
    .where(and(eq(tracks.isMissing, 0), collectionPredicate(kind, id)))
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

/**
 * Which tracks belong to an artist or album.
 *
 * Id 0 is the reserved "unknown" card, which is the *absence* of an artist or
 * album rather than one with that id — so it has to become `IS NULL` rather
 * than an equality nothing matches.
 */
function collectionPredicate(kind: 'artist' | 'album', id: number) {
  if (kind === 'artist') return id === 0 ? isNull(tracks.artistId) : eq(tracks.artistId, id);
  return id === 0 ? isNull(tracks.albumId) : eq(tracks.albumId, id);
}
