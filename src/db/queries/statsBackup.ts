import { eq, inArray, sql } from 'drizzle-orm';

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  eventKey,
  type LibraryAlbum,
  type LibraryPlaylist,
  type LibraryTrack,
  type RestorePlan,
  type StatsBackup,
} from '@/services/stats/backup';
import { foldDeltas, rollupDeltas } from '@/services/stats/rollups';

import { db } from '../client';
import {
  albums,
  artists,
  playEvents,
  playlistTracks,
  playlists,
  tracks,
  trackStats,
} from '../schema';
import { upsertRollups } from './playEvents';

/**
 * The listening history, out of the database and back into it.
 *
 * `collectBackup` reads every play event with the identity of its track — the
 * file, the tags, the length — which is what `planRestore` matches on after a
 * reinstall has renumbered every row. `applyRestore` writes a plan the way
 * `recordListen` writes one listen: the event, the per-track counters, and the
 * rollup cells, so a restored history and a lived one are the same rows.
 */

/** Rows per statement, well under SQLite's parameter ceiling at ~12 columns. */
const CHUNK = 60;

export async function collectBackup(): Promise<StatsBackup> {
  const rows = await db
    .select({
      trackId: playEvents.trackId,
      startedAtUtc: playEvents.startedAtUtc,
      msPlayed: playEvents.msPlayed,
      completed: playEvents.completed,
      outcome: playEvents.outcome,
      sourceType: playEvents.sourceType,
      sourceId: playEvents.sourceId,
      shuffleAlgorithm: playEvents.shuffleAlgorithm,
      weekKey: playEvents.weekKey,
      monthKey: playEvents.monthKey,
      yearKey: playEvents.yearKey,
    })
    .from(playEvents)
    .orderBy(playEvents.startedAtUtc);

  const favouriteRows = await db
    .select({ trackId: trackStats.trackId, favoriteAt: trackStats.favoriteAt })
    .from(trackStats)
    .where(eq(trackStats.isFavorite, 1));

  const playlistRows = await db.select().from(playlists).orderBy(playlists.id);
  const entryRows = await db
    .select({
      playlistId: playlistTracks.playlistId,
      trackId: playlistTracks.trackId,
      position: playlistTracks.position,
      addedAt: playlistTracks.addedAt,
    })
    .from(playlistTracks)
    .orderBy(playlistTracks.playlistId, playlistTracks.position);

  const albumFavouriteRows = await db
    .select({ name: albums.name, artist: artists.name, favoriteAt: albums.favoriteAt })
    .from(albums)
    .leftJoin(artists, eq(artists.id, albums.artistId))
    .where(eq(albums.isFavorite, 1));

  const ids = [
    ...new Set([
      ...rows.map((row) => row.trackId),
      ...favouriteRows.map((row) => row.trackId),
      ...entryRows.map((row) => row.trackId),
    ]),
  ];
  const identity = new Map<number, StatsBackup['tracks'][number]>();
  for (let start = 0; start < ids.length; start += CHUNK) {
    const chunk = ids.slice(start, start + CHUNK);
    const found = await db
      .select({
        id: tracks.id,
        uri: tracks.fileUri,
        title: tracks.title,
        artist: artists.name,
        album: albums.name,
        durationMs: tracks.durationMs,
      })
      .from(tracks)
      .leftJoin(artists, eq(artists.id, tracks.artistId))
      .leftJoin(albums, eq(albums.id, tracks.albumId))
      .where(inArray(tracks.id, chunk));
    for (const row of found) {
      identity.set(row.id, {
        uri: row.uri,
        title: row.title,
        artist: row.artist,
        album: row.album,
        durationMs: row.durationMs,
      });
    }
  }

  // Tracks are listed once and referenced by index, so the file is not a copy
  // of every title for every listen.
  const indexOf = new Map<number, number>();
  const trackList: StatsBackup['tracks'] = [];
  function indexFor(trackId: number): number | null {
    const known = indexOf.get(trackId);
    if (known !== undefined) return known;
    const track = identity.get(trackId);
    if (!track) return null;
    indexOf.set(trackId, trackList.length);
    trackList.push(track);
    return trackList.length - 1;
  }

  const events: StatsBackup['events'] = [];
  for (const row of rows) {
    const track = indexFor(row.trackId);
    if (track === null) continue;
    events.push({
      track,
      startedAtUtc: row.startedAtUtc,
      msPlayed: row.msPlayed,
      completed: row.completed === 1,
      outcome: asOutcome(row.outcome),
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      shuffleAlgorithm: row.shuffleAlgorithm,
      weekKey: row.weekKey,
      monthKey: row.monthKey,
      yearKey: row.yearKey,
    });
  }

  const favourites: StatsBackup['favourites'] = [];
  for (const row of favouriteRows) {
    const track = indexFor(row.trackId);
    if (track === null) continue;
    favourites.push({ track, favoriteAt: row.favoriteAt });
  }

  const entriesByPlaylist = new Map<number, StatsBackup['playlists'][number]['entries']>();
  for (const row of entryRows) {
    const track = indexFor(row.trackId);
    if (track === null) continue;
    const list = entriesByPlaylist.get(row.playlistId) ?? [];
    list.push({ track, position: row.position, addedAt: row.addedAt });
    entriesByPlaylist.set(row.playlistId, list);
  }

  const savedPlaylists: StatsBackup['playlists'] = playlistRows.map((row) => ({
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isFavorite: row.isFavorite === 1,
    favoriteAt: row.favoriteAt,
    // The file is named by the caller once it has copied the cover across;
    // here the path says only whether there is one to copy.
    cover: row.artworkPath === null ? null : coverFileName(row.createdAt),
    entries: entriesByPlaylist.get(row.id) ?? [],
  }));

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    tracks: trackList,
    events,
    favourites,
    playlists: savedPlaylists,
    albumFavourites: albumFavouriteRows.map((row) => ({
      name: row.name,
      artist: row.artist,
      favoriteAt: row.favoriteAt,
    })),
  };
}

/** The cover file a playlist gets in the backup folder, by its identity. */
export function coverFileName(createdAt: number): string {
  return `${createdAt}.jpg`;
}

/** Playlists with a cover on disk, with the file the backup names for each. */
export async function playlistCovers(): Promise<{ createdAt: number; path: string }[]> {
  const rows = await db
    .select({ createdAt: playlists.createdAt, path: playlists.artworkPath })
    .from(playlists);
  return rows.flatMap((row) => (row.path === null ? [] : [{ createdAt: row.createdAt, path: row.path }]));
}

/** Everything a restore needs to know about the library and the history. */
export async function libraryForRestore(): Promise<{
  library: LibraryTrack[];
  existing: Set<string>;
  playlists: LibraryPlaylist[];
  albums: LibraryAlbum[];
}> {
  const library = await db
    .select({
      id: tracks.id,
      uri: tracks.fileUri,
      title: tracks.title,
      artist: artists.name,
      durationMs: tracks.durationMs,
    })
    .from(tracks)
    .leftJoin(artists, eq(artists.id, tracks.artistId));

  const held = await db
    .select({ trackId: playEvents.trackId, startedAtUtc: playEvents.startedAtUtc })
    .from(playEvents);

  const playlistRows = await db
    .select({ id: playlists.id, name: playlists.name, createdAt: playlists.createdAt })
    .from(playlists);
  const entryRows = await db
    .select({ playlistId: playlistTracks.playlistId, trackId: playlistTracks.trackId })
    .from(playlistTracks);
  const trackIdsOf = new Map<number, number[]>();
  for (const row of entryRows) {
    const list = trackIdsOf.get(row.playlistId) ?? [];
    list.push(row.trackId);
    trackIdsOf.set(row.playlistId, list);
  }

  const albumRows = await db
    .select({ id: albums.id, name: albums.name, artist: artists.name })
    .from(albums)
    .leftJoin(artists, eq(artists.id, albums.artistId));

  return {
    library,
    existing: new Set(held.map((row) => eventKey(row.trackId, row.startedAtUtc))),
    playlists: playlistRows.map((row) => ({ ...row, trackIds: trackIdsOf.get(row.id) ?? [] })),
    albums: albumRows,
  };
}

export async function countPlayEvents(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(playEvents);
  return row?.count ?? 0;
}

/**
 * Write a plan: events, counters, rollups, hearts — in one transaction, so a
 * failure halfway leaves the history as it was rather than half restored.
 *
 * The rollups are rebuilt from the restored events through `rollupDeltas`,
 * the same fan-out `recordListen` uses, with the artist and album read from
 * the track rows as they are *now*. A restored listen is attributed the way a
 * new one would be.
 */
export async function applyRestore(
  plan: RestorePlan,
  /** Local cover paths, by the backup's cover file name. Copied in by the caller. */
  covers: ReadonlyMap<string, string> = new Map(),
): Promise<void> {
  const nothingToDo =
    plan.events.length === 0 &&
    plan.favourites.length === 0 &&
    plan.playlists.length === 0 &&
    plan.albumFavourites.length === 0;
  if (nothingToDo) return;

  const trackIds = [...new Set(plan.events.map((event) => event.trackId))];
  const subjects = new Map<number, { artistId: number | null; albumId: number | null }>();
  for (let start = 0; start < trackIds.length; start += CHUNK) {
    const rows = await db
      .select({ id: tracks.id, artistId: tracks.artistId, albumId: tracks.albumId })
      .from(tracks)
      .where(inArray(tracks.id, trackIds.slice(start, start + CHUNK)));
    for (const row of rows) subjects.set(row.id, { artistId: row.artistId, albumId: row.albumId });
  }

  await db.transaction(async (tx) => {
    for (let start = 0; start < plan.events.length; start += CHUNK) {
      await tx.insert(playEvents).values(
        plan.events.slice(start, start + CHUNK).map((event) => ({
          trackId: event.trackId,
          startedAtUtc: event.startedAtUtc,
          msPlayed: event.msPlayed,
          completed: event.completed ? 1 : 0,
          outcome: event.outcome,
          sourceType: event.sourceType,
          sourceId: event.sourceId,
          shuffleAlgorithm: event.shuffleAlgorithm,
          weekKey: event.weekKey,
          monthKey: event.monthKey,
          yearKey: event.yearKey,
        })),
      );
    }

    // Per-track counters, summed per track first so each row is one upsert.
    const counters = new Map<
      number,
      { playCount: number; skipCount: number; msPlayedTotal: number; lastPlayedAt: number }
    >();
    for (const event of plan.events) {
      const total = counters.get(event.trackId) ?? {
        playCount: 0,
        skipCount: 0,
        msPlayedTotal: 0,
        lastPlayedAt: 0,
      };
      if (event.outcome === 'play') total.playCount += 1;
      if (event.outcome === 'skip') total.skipCount += 1;
      total.msPlayedTotal += event.msPlayed;
      total.lastPlayedAt = Math.max(total.lastPlayedAt, event.startedAtUtc);
      counters.set(event.trackId, total);
    }
    for (const [trackId, total] of counters) {
      await tx
        .insert(trackStats)
        .values({ trackId, ...total })
        .onConflictDoUpdate({
          target: trackStats.trackId,
          set: {
            playCount: sql`${trackStats.playCount} + ${total.playCount}`,
            skipCount: sql`${trackStats.skipCount} + ${total.skipCount}`,
            msPlayedTotal: sql`${trackStats.msPlayedTotal} + ${total.msPlayedTotal}`,
            lastPlayedAt: sql`max(coalesce(${trackStats.lastPlayedAt}, 0), ${total.lastPlayedAt})`,
          },
        });
    }

    // A heart is only ever added by a restore, never taken away.
    for (const favourite of plan.favourites) {
      await tx
        .insert(trackStats)
        .values({ trackId: favourite.trackId, isFavorite: 1, favoriteAt: favourite.favoriteAt })
        .onConflictDoUpdate({
          target: trackStats.trackId,
          set: {
            isFavorite: 1,
            favoriteAt: sql`coalesce(${trackStats.favoriteAt}, ${favourite.favoriteAt})`,
          },
        });
    }

    for (const favourite of plan.albumFavourites) {
      await tx
        .update(albums)
        .set({
          isFavorite: 1,
          favoriteAt: sql`coalesce(${albums.favoriteAt}, ${favourite.favoriteAt})`,
        })
        .where(eq(albums.id, favourite.albumId));
    }

    for (const item of plan.playlists) {
      if (item.action === 'create') {
        const { playlist, entries } = item;
        const [created] = await tx
          .insert(playlists)
          .values({
            name: playlist.name,
            description: playlist.description,
            artworkPath: playlist.cover === null ? null : (covers.get(playlist.cover) ?? null),
            createdAt: playlist.createdAt,
            updatedAt: playlist.updatedAt,
            isFavorite: playlist.isFavorite ? 1 : 0,
            favoriteAt: playlist.favoriteAt,
          })
          .returning({ id: playlists.id });
        if (!created) continue;
        for (let start = 0; start < entries.length; start += CHUNK) {
          await tx.insert(playlistTracks).values(
            entries.slice(start, start + CHUNK).map((entry, offset) => ({
              playlistId: created.id,
              trackId: entry.trackId,
              position: start + offset,
              addedAt: entry.addedAt,
            })),
          );
        }
        continue;
      }

      if (item.isFavorite) {
        await tx
          .update(playlists)
          .set({ isFavorite: 1, favoriteAt: sql`coalesce(${playlists.favoriteAt}, ${item.favoriteAt})` })
          .where(eq(playlists.id, item.playlistId));
      }
      if (item.entries.length === 0) continue;
      const [row] = await tx
        .select({ highest: sql<number | null>`max(${playlistTracks.position})` })
        .from(playlistTracks)
        .where(eq(playlistTracks.playlistId, item.playlistId));
      let position = (row?.highest ?? -1) + 1;
      await tx.insert(playlistTracks).values(
        item.entries.map((entry) => ({
          playlistId: item.playlistId,
          trackId: entry.trackId,
          position: position++,
          addedAt: entry.addedAt,
        })),
      );
      await tx
        .update(playlists)
        .set({ updatedAt: Date.now() })
        .where(eq(playlists.id, item.playlistId));
    }

    const deltas = foldDeltas(
      plan.events.flatMap((event) => {
        const subject = subjects.get(event.trackId);
        return rollupDeltas({
          subject: {
            trackId: event.trackId,
            artistId: subject?.artistId ?? null,
            albumId: subject?.albumId ?? null,
            playlistId: event.sourceType === 'playlist' ? event.sourceId : null,
          },
          keys: { week: event.weekKey, month: event.monthKey, year: event.yearKey },
          msPlayed: event.msPlayed,
          countsAsPlay: event.outcome === 'play',
        });
      }),
    );
    await upsertRollups(deltas, tx);
  });
}

function asOutcome(value: string): StatsBackup['events'][number]['outcome'] {
  return value === 'play' || value === 'skip' ? value : 'partial';
}
