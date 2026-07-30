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
