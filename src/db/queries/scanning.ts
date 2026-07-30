import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '../client';
import { albums, artists, scanFolders, tracks } from '../schema';

/**
 * Writes the scanner performs. Kept here rather than in the scanner service
 * because only src/db may speak Drizzle — the service takes these as injected
 * ports, which is also what makes it testable without a device.
 */

export interface EnumeratedRow {
  mediaStoreId: string | null;
  fileUri: string;
  title: string;
  artistName: string | null;
  albumName: string | null;
  albumArtist: string | null;
  genre: string | null;
  trackNo: number | null;
  discNo: number | null;
  year: number | null;
  durationMs: number;
  fileSize: number | null;
  dateAdded: number;
  dateModified: number;
}

function sortNameOf(name: string): string {
  return name
    .toLocaleLowerCase('tr')
    .replace(/^(the|a|an)\s+/u, '')
    .trim();
}

/** Resolve or create an artist, returning its id. */
async function artistIdFor(name: string | null): Promise<number | null> {
  if (!name) return null;

  await db
    .insert(artists)
    .values({ name, sortName: sortNameOf(name) })
    .onConflictDoNothing();

  const [row] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.name, name))
    .limit(1);
  return row?.id ?? null;
}

async function albumIdFor(name: string | null, artistId: number | null): Promise<number | null> {
  if (!name) return null;

  await db.insert(albums).values({ name, artistId }).onConflictDoNothing();

  const [row] = await db
    .select({ id: albums.id })
    .from(albums)
    .where(
      and(
        eq(albums.name, name),
        artistId === null ? isNull(albums.artistId) : eq(albums.artistId, artistId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Stage one write. One transaction per batch — the tech stack calls for ~500
 * rows at a time so a scan does not fsync per track.
 */
export async function saveEnumerated(rows: EnumeratedRow[]): Promise<void> {
  if (rows.length === 0) return;

  for (const row of rows) {
    const artistId = await artistIdFor(row.artistName);
    const albumId = await albumIdFor(row.albumName, artistId);

    await db
      .insert(tracks)
      .values({
        mediaStoreId: row.mediaStoreId,
        fileUri: row.fileUri,
        title: row.title,
        artistId,
        albumId,
        albumArtist: row.albumArtist,
        genre: row.genre,
        trackNo: row.trackNo,
        discNo: row.discNo,
        year: row.year,
        durationMs: row.durationMs,
        fileSize: row.fileSize,
        dateAdded: row.dateAdded,
        dateModified: row.dateModified,
        isMissing: 0,
      })
      .onConflictDoUpdate({
        target: tracks.fileUri,
        set: {
          title: sql`excluded.title`,
          durationMs: sql`excluded.duration_ms`,
          fileSize: sql`excluded.file_size`,
          dateModified: sql`excluded.date_modified`,
          // A file that came back is no longer missing.
          isMissing: sql`0`,
        },
      });
  }
}

export interface EnrichedRow {
  fileUri: string;
  fields: {
    title?: string;
    genre: string | null;
    trackNo: number | null;
    discNo: number | null;
    year: number | null;
    container: string | null;
    codec: string | null;
    bitrateKbps: number | null;
    sampleRateHz: number | null;
    bitDepth: number | null;
    channels: number | null;
    artworkPath: string | null;
  };
}

/** Stage two write. Sets `lastScannedAt`, which is what marks a row done. */
export async function saveEnriched(rows: EnrichedRow[]): Promise<void> {
  const now = Date.now();

  for (const { fileUri, fields } of rows) {
    await db
      .update(tracks)
      .set({
        ...(fields.title ? { title: fields.title } : {}),
        genre: fields.genre,
        trackNo: fields.trackNo,
        discNo: fields.discNo,
        year: fields.year,
        container: fields.container,
        codec: fields.codec,
        bitrateKbps: fields.bitrateKbps,
        sampleRateHz: fields.sampleRateHz,
        bitDepth: fields.bitDepth,
        channels: fields.channels,
        artworkPath: fields.artworkPath,
        lastScannedAt: now,
      })
      .where(eq(tracks.fileUri, fileUri));
  }
}

/**
 * Rows stage two has not reached. `lastScannedAt` being null is the queue —
 * no separate table, and a scan that dies mid-way resumes exactly where it
 * stopped.
 */
export async function listUnenrichedUris(limit: number): Promise<string[]> {
  const rows = await db
    .select({ fileUri: tracks.fileUri })
    .from(tracks)
    .where(and(isNull(tracks.lastScannedAt), eq(tracks.isMissing, 0)))
    .limit(limit);

  return rows.map((row) => row.fileUri);
}

/** Folders the user added by hand, on top of whatever MediaStore indexes. */
export async function addScanFolder(uri: string): Promise<void> {
  await db.insert(scanFolders).values({ uri, enabled: 1 }).onConflictDoNothing();
}

export async function listScanFolders() {
  return db.select().from(scanFolders).where(eq(scanFolders.enabled, 1));
}
