import type { MediaStoreTrack, TrackTags } from 'audio-tags';

/**
 * Pure translation between what the device reports and what the database
 * stores. No native import, so all of it is unit tested.
 */

export interface ScannedTrack {
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

/**
 * MediaStore packs disc and track into one integer as `disc * 1000 + track`
 * when the file carries a disc number. Mirrors `SpecMath.unpackTrackNumber`
 * on the Kotlin side — the two are tested independently and must agree.
 */
export function unpackTrackNumber(raw: number | null | undefined): {
  discNo: number | null;
  trackNo: number | null;
} {
  if (raw == null || raw <= 0) return { discNo: null, trackNo: null };
  if (raw < 1000) return { discNo: null, trackNo: raw };

  const discNo = Math.floor(raw / 1000);
  const track = raw % 1000;
  return { discNo, trackNo: track === 0 ? null : track };
}

/** Strip a leading article so "The Doors" files under D. */
export function sortNameOf(name: string): string {
  return name
    .toLocaleLowerCase('tr')
    .replace(/^(the|a|an)\s+/u, '')
    .trim();
}

/**
 * A title always exists in the UI even when the file has no tags — falling
 * back to the file name minus its extension, which is what the user sees in
 * a file manager.
 */
export function titleFrom(tagTitle: string | null, displayName: string): string {
  const trimmed = tagTitle?.trim();
  if (trimmed) return trimmed;

  const withoutExtension = displayName.replace(/\.[^.]+$/u, '').trim();
  return withoutExtension || displayName;
}

/** Stage one: everything MediaStore already knew, with nothing opened. */
export function fromMediaStore(row: MediaStoreTrack): ScannedTrack {
  const { discNo, trackNo } = unpackTrackNumber(row.trackNumberRaw);

  return {
    mediaStoreId: row.mediaStoreId,
    fileUri: row.uri,
    title: titleFrom(row.title, row.displayName),
    artistName: blankToNull(row.artist),
    albumName: blankToNull(row.album),
    albumArtist: blankToNull(row.albumArtist),
    genre: blankToNull(row.genre),
    trackNo,
    discNo,
    year: positiveOrNull(row.year),
    durationMs: Math.max(0, Math.round(row.durationMs)),
    fileSize: positiveOrNull(row.size),
    dateAdded: row.dateAdded,
    dateModified: row.dateModified,
  };
}

export interface EnrichedFields {
  title?: string;
  artistName: string | null;
  albumName: string | null;
  albumArtist: string | null;
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
}

/**
 * Stage two: what opening the file added.
 *
 * Tags win over MediaStore where both have an opinion, because MediaStore's
 * index can be stale after a tag edit. Anything the retriever returned null
 * for is left null rather than guessed — the spec strip renders what it has.
 */
export function fromTags(tags: TrackTags): EnrichedFields | null {
  if (tags.error) return null;

  const { discNo, trackNo } = unpackTrackNumber(tags.trackNumberRaw);

  return {
    ...(tags.title?.trim() ? { title: tags.title.trim() } : {}),
    artistName: blankToNull(tags.artist),
    albumName: blankToNull(tags.album),
    albumArtist: blankToNull(tags.albumArtist),
    genre: blankToNull(tags.genre),
    trackNo,
    discNo: tags.discNumber ?? discNo,
    year: positiveOrNull(tags.year),
    container: containerOf(tags.mimeType),
    codec: codecOf(tags.mimeType),
    bitrateKbps: positiveOrNull(tags.bitrateKbps),
    sampleRateHz: positiveOrNull(tags.sampleRateHz),
    bitDepth: positiveOrNull(tags.bitDepth),
    channels: positiveOrNull(tags.channels),
    artworkPath: tags.artworkPath,
  };
}

/** `audio/flac` -> `FLAC`, for the first field of the spec strip. */
export function containerOf(mimeType: string | null): string | null {
  const subtype = mimeType?.split('/')[1]?.replace(/^x-/u, '');
  if (!subtype) return null;
  return CONTAINER_NAMES[subtype] ?? subtype.toUpperCase();
}

const CONTAINER_NAMES: Record<string, string> = {
  mpeg: 'MP3',
  'mp4a-latm': 'AAC',
  'vnd.wave': 'WAV',
  wav: 'WAV',
  flac: 'FLAC',
  ogg: 'OGG',
  opus: 'Opus',
  vorbis: 'Vorbis',
  aiff: 'AIFF',
  mp4: 'M4A',
};

/**
 * The codec, when it says something the container does not.
 *
 * Both this and `containerOf` read the same MIME subtype, so whenever the
 * subtype has a container name the codec is the identical fact spelled worse:
 * `audio/mpeg` produced the strip `MP3 · mpeg`, which reads like a bug.
 *
 * Null in that case. The column stays because container and codec genuinely
 * differ for things like ALAC inside MP4 — MediaStore's MIME type simply
 * cannot tell us so, and a real codec source can fill it in later without
 * anything downstream changing.
 */
export function codecOf(mimeType: string | null): string | null {
  const subtype = mimeType?.split('/')[1]?.replace(/^x-/u, '')?.toLowerCase();
  if (!subtype) return null;
  return subtype in CONTAINER_NAMES ? null : subtype;
}

/** Lossless gets a visual distinction on the spec strip. */
export function isLossless(mimeType: string | null): boolean {
  const mime = mimeType?.toLowerCase();
  if (!mime) return false;
  return ['flac', 'alac', 'wav', 'aiff', 'ape', 'wavpack'].some((hint) => mime.includes(hint));
}

/**
 * The incremental rescan test. A file whose size and modification time are
 * unchanged is not reopened — this is what makes a rescan of an untouched
 * library near-instant.
 */
export function needsRescan(
  existing: { fileSize: number | null; dateModified: number } | null,
  incoming: { fileSize: number | null; dateModified: number },
): boolean {
  if (!existing) return true;
  if (existing.dateModified !== incoming.dateModified) return true;
  return existing.fileSize !== incoming.fileSize;
}

/**
 * MediaStore's stand-in for a missing tag.
 *
 * It writes the literal string `<unknown>` rather than null for an untagged
 * artist or album. Stored as-is it becomes a real artist named `<unknown>`:
 * it gets an `artists` row, appears in the library, tops the statistics for
 * anyone with a folder of untagged files, and — worst — the balanced shuffle
 * treats every untagged track as the same act and spreads them apart.
 */
const MEDIASTORE_UNKNOWN = '<unknown>';

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase() === MEDIASTORE_UNKNOWN ? null : trimmed;
}

function positiveOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && value > 0 ? value : null;
}
