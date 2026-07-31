import { count } from 'drizzle-orm';

import { db } from './client';
import { albums, artists, tracks } from './schema';

/*
 * Fake library for UI work, so Phase 4 can build lists before Phase 2 can
 * fill them. Development only — nothing calls this in a release build.
 *
 * The data is deliberately awkward in the ways a real library is: lossy and
 * lossless side by side, a 24/96 record, a track with no album artist, long
 * Turkish titles that stress the layout, and a missing file.
 */

interface SeedAlbum {
  artist: string;
  album: string;
  year: number;
  titles: string[];
  container: string;
  codec: string;
  bitrateKbps: number;
  sampleRateHz: number;
  bitDepth: number;
}

const SEED_ALBUMS: SeedAlbum[] = [
  {
    artist: 'Cem Karaca',
    album: 'Nem Kaldı',
    year: 1976,
    titles: ['Nem Kaldı', 'Resimdeki Gözyaşları', 'Hasret', 'Islak Islak'],
    container: 'FLAC',
    codec: 'flac',
    bitrateKbps: 1006,
    sampleRateHz: 44_100,
    bitDepth: 16,
  },
  {
    artist: 'Barış Manço',
    album: 'Sakla Samanı Gelir Zamanı',
    year: 1981,
    titles: ['Sarı Çizmeli Mehmet Ağa', 'Dönence', 'Gülpembe', 'Arkadaşım Eşşek'],
    container: 'FLAC',
    codec: 'flac',
    bitrateKbps: 2304,
    sampleRateHz: 96_000,
    bitDepth: 24,
  },
  {
    artist: 'Erkin Koray',
    album: 'Elektronik Türküler',
    year: 1974,
    titles: ['Cemalim', 'Türkü', 'Krizantem', 'Estarabim'],
    container: 'MP3',
    codec: 'mp3',
    bitrateKbps: 320,
    sampleRateHz: 44_100,
    bitDepth: 16,
  },
  {
    artist: 'Selda Bağcan',
    album: 'Selda',
    year: 1976,
    titles: ['Yaz Gazeteci Yaz', 'İnce İnce Bir Kar Yağar', 'Nem Kaldı', 'Katip Arzuhalim'],
    container: 'FLAC',
    codec: 'flac',
    bitrateKbps: 941,
    sampleRateHz: 44_100,
    bitDepth: 16,
  },
];

function sortName(name: string): string {
  return name.toLocaleLowerCase('tr').replace(/^(the|a|an)\s+/, '');
}

/** True when there is nothing in the library yet. */
export async function isDatabaseEmpty(): Promise<boolean> {
  const [row] = await db.select({ value: count() }).from(tracks);
  return (row?.value ?? 0) === 0;
}

/** Insert the fake library. Safe to call twice — it no-ops when populated. */
export async function seedDatabase(): Promise<number> {
  if (!(await isDatabaseEmpty())) return 0;

  const now = Date.now();
  let inserted = 0;

  for (const entry of SEED_ALBUMS) {
    const [artist] = await db
      .insert(artists)
      .values({ name: entry.artist, sortName: sortName(entry.artist) })
      .onConflictDoNothing()
      .returning();

    const artistId = artist?.id ?? null;

    const [album] = await db
      .insert(albums)
      .values({ name: entry.album, artistId, year: entry.year })
      .onConflictDoNothing()
      .returning();

    const rows = entry.titles.map((title, index) => ({
      fileUri: `file:///seed/${entry.artist}/${entry.album}/${index + 1}-${title}.${entry.codec}`,
      title,
      artistId,
      albumId: album?.id ?? null,
      albumArtist: entry.artist,
      genre: 'Anadolu rock',
      trackNo: index + 1,
      discNo: 1,
      year: entry.year,
      // 3–6 minutes, deterministic so screenshots do not churn.
      durationMs: 180_000 + index * 47_000,
      fileSize: 30_000_000 + index * 4_100_000,
      container: entry.container,
      codec: entry.codec,
      bitrateKbps: entry.bitrateKbps,
      sampleRateHz: entry.sampleRateHz,
      bitDepth: entry.bitDepth,
      channels: 2,
      dateAdded: now,
      dateModified: now,
      lastScannedAt: now,
      // One track per album is "gone", to exercise the is_missing path.
      isMissing: index === 3 ? 1 : 0,
    }));

    await db.insert(tracks).values(rows).onConflictDoNothing();
    inserted += rows.length;
  }

  return inserted;
}

/** Remove everything the seed inserted. Development only. */
export async function clearDatabase(): Promise<void> {
  await db.delete(tracks);
  await db.delete(albums);
  await db.delete(artists);
}

/*
 * The stress library.
 *
 * Phase 9 has to profile against 10,000 tracks and there is no honest way to
 * get there by hand. The shape matters as much as the size: 10,000 tracks in
 * one album is a different query plan from 10,000 across 700 artists, and the
 * second is what a real hoarder's library looks like.
 */

const STRESS_TRACKS_PER_ALBUM = 12;
const STRESS_ALBUMS_PER_ARTIST = 3;
/** SQLite's default variable ceiling is 999; each row binds ~20 columns. */
const STRESS_BATCH = 400;

/** Words that combine into plausible titles without shipping a dictionary. */
const HEADS = ['Kar', 'Deniz', 'Gece', 'Sabah', 'Yol', 'Rüzgâr', 'Ateş', 'Gölge', 'Ay', 'Taş'];
const TAILS = ['Şarkısı', 'Yolu', 'Vakti', 'Sesi', 'Rengi', 'Hâli', 'Düşü', 'Sonu'];

/**
 * Insert `total` synthetic tracks for profiling. Development only.
 *
 * Deterministic: the same `total` produces the same library, so a before/after
 * measurement compares the same data rather than two different random ones.
 * Batched in transactions because 10,000 individual inserts take minutes and
 * hold the JS thread, which would be measuring the seed rather than the app.
 */
export async function seedStressLibrary(total: number): Promise<number> {
  const artistCount = Math.max(1, Math.ceil(total / (STRESS_TRACKS_PER_ALBUM * STRESS_ALBUMS_PER_ARTIST)));
  const now = Date.now();

  const artistIds: (number | null)[] = [];
  for (let index = 0; index < artistCount; index += 1) {
    const name = `Sanatçı ${String(index + 1).padStart(4, '0')}`;
    const [row] = await db
      .insert(artists)
      .values({ name, sortName: sortName(name) })
      .onConflictDoNothing()
      .returning();
    artistIds.push(row?.id ?? null);
  }

  const albumIds: { id: number | null; artistId: number | null; name: string }[] = [];
  for (const [index, artistId] of artistIds.entries()) {
    for (let disc = 0; disc < STRESS_ALBUMS_PER_ARTIST; disc += 1) {
      const name = `Albüm ${index + 1}-${disc + 1}`;
      const [row] = await db
        .insert(albums)
        .values({ name, artistId, year: 1970 + ((index + disc) % 55) })
        .onConflictDoNothing()
        .returning();
      albumIds.push({ id: row?.id ?? null, artistId, name });
    }
  }

  let inserted = 0;
  let batch: (typeof tracks.$inferInsert)[] = [];

  for (let index = 0; index < total; index += 1) {
    const album = albumIds[index % albumIds.length];
    const trackNo = Math.floor(index / albumIds.length) + 1;
    const lossless = index % 3 !== 0;

    batch.push({
      fileUri: `file:///stress/${index}.${lossless ? 'flac' : 'mp3'}`,
      // Titles vary in the first character so the alphabetical index and the
      // fast-scroll letter bar both get something to do.
      title: `${HEADS[index % HEADS.length]} ${TAILS[index % TAILS.length]} ${index + 1}`,
      artistId: album?.artistId ?? null,
      albumId: album?.id ?? null,
      albumArtist: null,
      genre: `Tür ${index % 12}`,
      trackNo,
      discNo: 1,
      year: 1970 + (index % 55),
      durationMs: 120_000 + ((index * 7_919) % 300_000),
      fileSize: 8_000_000 + ((index * 104_729) % 60_000_000),
      container: lossless ? 'FLAC' : 'MP3',
      codec: lossless ? 'flac' : 'mp3',
      bitrateKbps: lossless ? 900 + (index % 1_500) : 128 + (index % 193),
      sampleRateHz: lossless && index % 7 === 0 ? 96_000 : 44_100,
      bitDepth: lossless && index % 7 === 0 ? 24 : 16,
      channels: 2,
      dateAdded: now,
      dateModified: now,
      lastScannedAt: now,
      isMissing: 0,
    });

    if (batch.length >= STRESS_BATCH) {
      await db.insert(tracks).values(batch).onConflictDoNothing();
      inserted += batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    await db.insert(tracks).values(batch).onConflictDoNothing();
    inserted += batch.length;
  }

  return inserted;
}
