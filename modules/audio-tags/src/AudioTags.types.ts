/**
 * Shapes crossing the JS↔native boundary.
 *
 * Two calls, deliberately: a cheap one that enumerates everything MediaStore
 * already knows, and an expensive one that opens files. Stage one paints the
 * library; stage two fills in the detail in the background.
 */

/**
 * One row of the MediaStore cursor. Everything here comes from a single query
 * — no per-asset round trip, which is what makes a 10,000-track enumeration
 * viable.
 */
export interface MediaStoreTrack {
  /** MediaStore `_ID`. Stable for as long as the file is indexed. */
  mediaStoreId: string;
  /** `content://media/external/audio/media/<id>`. */
  uri: string;
  /** File name including extension. */
  displayName: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  genre: string | null;
  /** Milliseconds. */
  durationMs: number;
  /**
   * Bytes. MediaStore has this and `expo-media-library` does not, which is
   * one of the reasons this module exists — the incremental rescan key is
   * `(size, modificationTime)`.
   */
  size: number;
  /** Epoch milliseconds. */
  dateAdded: number;
  dateModified: number;
  mimeType: string | null;
  /**
   * MediaStore packs disc and track into one integer as `disc * 1000 + track`
   * when a disc number is present. Unpacked on the JS side by
   * `unpackTrackNumber`.
   */
  trackNumberRaw: number | null;
  year: number | null;
}

/**
 * The result of opening one file. Every field is nullable: below API 31 the
 * retriever has no sample rate or bit depth, and at any API level an
 * extractor may simply not populate a field.
 */
export interface TrackTags {
  uri: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  genre: string | null;
  trackNumberRaw: number | null;
  discNumber: number | null;
  year: number | null;

  durationMs: number | null;
  /** Reported by the container. Null for most FLAC files — compute it. */
  bitrateKbps: number | null;
  /** API 31+. */
  sampleRateHz: number | null;
  /** API 31+. */
  bitDepth: number | null;
  channels: number | null;
  mimeType: string | null;

  /**
   * Paths to JPEGs already written into the cache directory, or null when the
   * file has no embedded picture. Image bytes never cross the bridge.
   */
  artworkPath: string | null;
  artworkThumbPath: string | null;

  /** Set when the file could not be opened at all. */
  error: string | null;
}

/**
 * The outcome of asking for the audio-reading permission.
 *
 * `canAskAgain` is false once the user has denied permanently (or the OEM has
 * blocked the prompt outright, which MIUI does). That case cannot be retried —
 * the only way forward is system settings — so it needs a different message
 * from an ordinary "not now".
 */
export interface AudioPermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}

export interface MediaStoreQueryOptions {
  /** Page size. The caller walks pages so the UI can paint between them. */
  limit: number;
  offset: number;
  /** Skip anything shorter than this. The "ignore short files" setting. */
  minDurationMs?: number;
}

export interface ReadTagsOptions {
  /** Absolute directory the artwork JPEGs are written into. */
  artworkDirectory: string;
  /** Longest edge of the full-size artwork. */
  artworkSize?: number;
  /** Longest edge of the list thumbnail. */
  thumbnailSize?: number;
}
