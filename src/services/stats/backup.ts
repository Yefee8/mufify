import { normalizeName } from '@/services/text/similarity';

/**
 * Listening history as a file: what goes in it, and how it comes back.
 *
 * The database is the app's, and Android takes it away with the app: an
 * uninstall, a "clear data", a build signed with a different key that has to
 * be removed before the next one can go on. A year of listening is the one
 * thing in that database that cannot be rebuilt by scanning again, so it is
 * written somewhere the app does not own — a hidden folder inside the music
 * folder the user picked — and read back from there.
 *
 * Pure, like everything under `services/stats`: no storage, no database, no
 * file system. The shape of the file, the check that a file is one of ours,
 * and the matching of an old row to a new one are all decisions that have to
 * give the same answer in a test as on a phone. Reading and writing the file
 * is `services/backup`.
 *
 * ## Identity across a reinstall
 *
 * Rows in the backup cannot carry database ids: a rescan after a reinstall
 * hands out new ones. A track is identified by its **file URI** first — a
 * MediaStore id, stable on one device for as long as the file is — and by its
 * **tags** second: a normalised title, a normalised artist, and a length. The
 * second tier is what survives a re-copied file or a rebuilt media index, and
 * it is compared the way the library compares names, so a spelling that the
 * library treats as one track is one track here too.
 *
 * Events, not rollups. The rollups are keyed by artist and album ids, which
 * are as ephemeral as track ids; the events carry everything needed to build
 * them again, and `recordListen` already knows how.
 *
 * Playlists too, since version 2: their rows, their entries by track identity,
 * their hearts, and the name of a cover file kept beside this one. An album
 * heart travels by the album's name and band, which is how the scanner keys
 * albums in the first place.
 */

export const BACKUP_FORMAT = 'mufify-statistics';
/** 2 added playlists and album hearts. A version-1 file is still read. */
export const BACKUP_VERSION = 2;

/** A track as the backup knows it. */
export interface BackupTrack {
  uri: string;
  title: string;
  artist: string | null;
  album: string | null;
  durationMs: number;
}

/** One listen, pointing at `tracks` by index. */
export interface BackupEvent {
  track: number;
  startedAtUtc: number;
  msPlayed: number;
  completed: boolean;
  outcome: 'play' | 'skip' | 'partial';
  sourceType: string;
  sourceId: number | null;
  shuffleAlgorithm: string | null;
  weekKey: string;
  monthKey: string;
  yearKey: string;
}

/** What `track_stats` holds that the events do not: the heart. */
export interface BackupFavourite {
  track: number;
  favoriteAt: number | null;
}

export interface BackupPlaylistEntry {
  track: number;
  position: number;
  addedAt: number;
}

/**
 * A playlist, identified across a reinstall by its name and the instant it
 * was created — the one pair nothing else in the app produces twice.
 */
export interface BackupPlaylist {
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  isFavorite: boolean;
  favoriteAt: number | null;
  /** A file name inside the backup's `covers` folder, or null for the mosaic. */
  cover: string | null;
  entries: BackupPlaylistEntry[];
}

/** An album heart, by the album's name and its band's — the scanner's key. */
export interface BackupAlbumFavourite {
  name: string;
  artist: string | null;
  favoriteAt: number | null;
}

export interface StatsBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: number;
  tracks: BackupTrack[];
  events: BackupEvent[];
  favourites: BackupFavourite[];
  playlists: BackupPlaylist[];
  albumFavourites: BackupAlbumFavourite[];
}

/** The file, as text. Compact: a year of listening is thousands of rows. */
export function serializeBackup(backup: StatsBackup): string {
  return JSON.stringify(backup);
}

/**
 * The file, read back — or null for anything that is not one of ours.
 *
 * Every field the restore reads is checked, because the file lives in a folder
 * the user can see and edit, and a hand-edited or truncated file must come
 * back as "no backup" rather than as a crash halfway through a restore.
 */
export function parseBackup(text: string): StatsBackup | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.format !== BACKUP_FORMAT) return null;
  if (parsed.version !== 1 && parsed.version !== BACKUP_VERSION) return null;
  if (!Array.isArray(parsed.tracks) || !Array.isArray(parsed.events)) return null;
  if (!Array.isArray(parsed.favourites)) return null;
  // Version 1 had neither. Absent is the same as empty; present must be a list.
  const rawPlaylists = parsed.playlists ?? [];
  const rawAlbumFavourites = parsed.albumFavourites ?? [];
  if (!Array.isArray(rawPlaylists) || !Array.isArray(rawAlbumFavourites)) return null;

  const tracks: BackupTrack[] = [];
  for (const entry of parsed.tracks) {
    if (!isRecord(entry) || typeof entry.uri !== 'string' || typeof entry.title !== 'string') {
      return null;
    }
    if (typeof entry.durationMs !== 'number') return null;
    tracks.push({
      uri: entry.uri,
      title: entry.title,
      artist: typeof entry.artist === 'string' ? entry.artist : null,
      album: typeof entry.album === 'string' ? entry.album : null,
      durationMs: entry.durationMs,
    });
  }

  const events: BackupEvent[] = [];
  for (const entry of parsed.events) {
    if (!isRecord(entry)) return null;
    if (!isIndex(entry.track, tracks.length)) return null;
    if (typeof entry.startedAtUtc !== 'number' || typeof entry.msPlayed !== 'number') return null;
    if (!isOutcome(entry.outcome) || typeof entry.sourceType !== 'string') return null;
    if (!isKey(entry.weekKey) || !isKey(entry.monthKey) || !isKey(entry.yearKey)) return null;
    events.push({
      track: entry.track,
      startedAtUtc: entry.startedAtUtc,
      msPlayed: entry.msPlayed,
      completed: entry.completed === true,
      outcome: entry.outcome,
      sourceType: entry.sourceType,
      sourceId: typeof entry.sourceId === 'number' ? entry.sourceId : null,
      shuffleAlgorithm: typeof entry.shuffleAlgorithm === 'string' ? entry.shuffleAlgorithm : null,
      weekKey: entry.weekKey,
      monthKey: entry.monthKey,
      yearKey: entry.yearKey,
    });
  }

  const favourites: BackupFavourite[] = [];
  for (const entry of parsed.favourites) {
    if (!isRecord(entry) || !isIndex(entry.track, tracks.length)) return null;
    favourites.push({
      track: entry.track,
      favoriteAt: typeof entry.favoriteAt === 'number' ? entry.favoriteAt : null,
    });
  }

  const playlists: BackupPlaylist[] = [];
  for (const entry of rawPlaylists) {
    if (!isRecord(entry) || typeof entry.name !== 'string') return null;
    if (typeof entry.createdAt !== 'number' || !Array.isArray(entry.entries)) return null;
    const entries: BackupPlaylistEntry[] = [];
    for (const item of entry.entries) {
      if (!isRecord(item) || !isIndex(item.track, tracks.length)) return null;
      if (typeof item.position !== 'number') return null;
      entries.push({
        track: item.track,
        position: item.position,
        addedAt: typeof item.addedAt === 'number' ? item.addedAt : entry.createdAt,
      });
    }
    playlists.push({
      name: entry.name,
      description: typeof entry.description === 'string' ? entry.description : null,
      createdAt: entry.createdAt,
      updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : entry.createdAt,
      isFavorite: entry.isFavorite === true,
      favoriteAt: typeof entry.favoriteAt === 'number' ? entry.favoriteAt : null,
      cover: typeof entry.cover === 'string' ? entry.cover : null,
      entries,
    });
  }

  const albumFavourites: BackupAlbumFavourite[] = [];
  for (const entry of rawAlbumFavourites) {
    if (!isRecord(entry) || typeof entry.name !== 'string') return null;
    albumFavourites.push({
      name: entry.name,
      artist: typeof entry.artist === 'string' ? entry.artist : null,
      favoriteAt: typeof entry.favoriteAt === 'number' ? entry.favoriteAt : null,
    });
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : 0,
    tracks,
    events,
    favourites,
    playlists,
    albumFavourites,
  };
}

/** A track as the library has it now. Structural, to keep the db out of it. */
export interface LibraryTrack {
  id: number;
  uri: string;
  title: string;
  artist: string | null;
  durationMs: number;
}

/** An event the database already holds, so it is not written twice. */
export function eventKey(trackId: number, startedAtUtc: number): string {
  return `${trackId}:${startedAtUtc}`;
}

export interface RestorableEvent extends Omit<BackupEvent, 'track'> {
  trackId: number;
}

/** A playlist as the database has it now. */
export interface LibraryPlaylist {
  id: number;
  name: string;
  createdAt: number;
  /** Track ids already in it, so an entry is not added twice. */
  trackIds: readonly number[];
}

/** An album as the database has it now. */
export interface LibraryAlbum {
  id: number;
  name: string;
  artist: string | null;
}

export interface RestorableEntry {
  trackId: number;
  addedAt: number;
}

/** A playlist to create, entries in order. `cover` names a file to copy in. */
export interface PlaylistCreation {
  action: 'create';
  playlist: Omit<BackupPlaylist, 'entries'>;
  entries: RestorableEntry[];
}

/** A playlist that already exists; only what it lacks is appended. */
export interface PlaylistAppend {
  action: 'append';
  playlistId: number;
  isFavorite: boolean;
  favoriteAt: number | null;
  entries: RestorableEntry[];
}

export interface RestorePlan {
  events: RestorableEvent[];
  favourites: { trackId: number; favoriteAt: number | null }[];
  playlists: (PlaylistCreation | PlaylistAppend)[];
  albumFavourites: { albumId: number; favoriteAt: number | null }[];
  /** Backup tracks with no counterpart in the library. Their listens wait. */
  unmatchedTracks: number;
  /** Events already in the database, skipped. */
  alreadyPresent: number;
}

export interface RestoreInput {
  library: readonly LibraryTrack[];
  existing: ReadonlySet<string>;
  playlists?: readonly LibraryPlaylist[];
  albums?: readonly LibraryAlbum[];
}

/**
 * Decide what a backup adds to the library as it is now.
 *
 * Idempotent by construction: an event is skipped when the database already
 * holds one for the same track at the same instant, so restoring the same file
 * twice — or restoring after a backup was taken from this very install —
 * writes nothing the second time.
 *
 * A backup track with no match is not an error. The file may be on an SD card
 * that is not mounted, or in a folder not scanned yet; its listens stay in the
 * backup and come in on a later restore, once the track is there to attach
 * them to.
 */
export function planRestore(backup: StatsBackup, input: RestoreInput): RestorePlan {
  const { library, existing } = input;
  const byUri = new Map<string, number>();
  const byTags = new Map<string, LibraryTrack[]>();
  for (const track of library) {
    byUri.set(track.uri, track.id);
    const key = tagKey(track.title, track.artist);
    const bucket = byTags.get(key);
    if (bucket) bucket.push(track);
    else byTags.set(key, [track]);
  }

  const matched = backup.tracks.map((track) => matchTrack(track, byUri, byTags));
  const unmatchedTracks = matched.filter((id) => id === null).length;

  const events: RestorableEvent[] = [];
  let alreadyPresent = 0;
  const seen = new Set<string>();
  for (const event of backup.events) {
    const trackId = matched[event.track];
    if (trackId === null || trackId === undefined) continue;
    const key = eventKey(trackId, event.startedAtUtc);
    if (existing.has(key) || seen.has(key)) {
      alreadyPresent += 1;
      continue;
    }
    seen.add(key);
    const { track: _index, ...rest } = event;
    events.push({ ...rest, trackId });
  }

  const favourites: RestorePlan['favourites'] = [];
  for (const favourite of backup.favourites) {
    const trackId = matched[favourite.track];
    if (trackId === null || trackId === undefined) continue;
    favourites.push({ trackId, favoriteAt: favourite.favoriteAt });
  }

  const playlists = planPlaylists(backup.playlists, matched, input.playlists ?? []);
  const albumFavourites = planAlbumFavourites(backup.albumFavourites, input.albums ?? []);

  return { events, favourites, playlists, albumFavourites, unmatchedTracks, alreadyPresent };
}

/**
 * A playlist that exists — same name, created at the same instant — gains
 * only the tracks it does not already hold, at the end. One that does not is
 * created with its entries in the order they were, positions closed up over
 * any track the library does not hold yet.
 */
function planPlaylists(
  saved: readonly BackupPlaylist[],
  matched: readonly (number | null)[],
  current: readonly LibraryPlaylist[],
): RestorePlan['playlists'] {
  const plans: RestorePlan['playlists'] = [];

  for (const playlist of saved) {
    const ordered = [...playlist.entries].sort((a, b) => a.position - b.position);
    const entries: RestorableEntry[] = [];
    for (const entry of ordered) {
      const trackId = matched[entry.track];
      if (trackId !== null && trackId !== undefined) entries.push({ trackId, addedAt: entry.addedAt });
    }

    const found = current.find(
      (candidate) => candidate.createdAt === playlist.createdAt && candidate.name === playlist.name,
    );
    if (found) {
      const held = new Set(found.trackIds);
      const missing = entries.filter((entry) => !held.has(entry.trackId));
      plans.push({
        action: 'append',
        playlistId: found.id,
        isFavorite: playlist.isFavorite,
        favoriteAt: playlist.favoriteAt,
        entries: missing,
      });
      continue;
    }

    const { entries: _entries, ...rest } = playlist;
    plans.push({ action: 'create', playlist: rest, entries });
  }

  return plans;
}

/** An album heart finds its album by name and band, the scanner's own key. */
function planAlbumFavourites(
  saved: readonly BackupAlbumFavourite[],
  albums: readonly LibraryAlbum[],
): RestorePlan['albumFavourites'] {
  const byKey = new Map<string, number>();
  for (const album of albums) byKey.set(tagKey(album.name, album.artist), album.id);

  const result: RestorePlan['albumFavourites'] = [];
  for (const favourite of saved) {
    if (normalizeName(favourite.name).length === 0) continue;
    const albumId = byKey.get(tagKey(favourite.name, favourite.artist));
    if (albumId !== undefined) result.push({ albumId, favoriteAt: favourite.favoriteAt });
  }
  return result;
}

/** Two seconds, or two percent: the same allowance `dedupeTracks` gives. */
function sameLength(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(2_000, Math.max(left, right) * 0.02);
}

function tagKey(title: string, artist: string | null): string {
  return `${normalizeName(title)} ${normalizeName(artist ?? '')}`;
}

function matchTrack(
  track: BackupTrack,
  byUri: ReadonlyMap<string, number>,
  byTags: ReadonlyMap<string, readonly LibraryTrack[]>,
): number | null {
  const direct = byUri.get(track.uri);
  if (direct !== undefined) return direct;

  // An untitled file has nothing to match on but its URI, which just failed.
  if (normalizeName(track.title).length === 0) return null;

  const candidates = byTags.get(tagKey(track.title, track.artist)) ?? [];
  const fit = candidates.find((candidate) => sameLength(candidate.durationMs, track.durationMs));
  return fit?.id ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIndex(value: unknown, length: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length;
}

function isOutcome(value: unknown): value is BackupEvent['outcome'] {
  return value === 'play' || value === 'skip' || value === 'partial';
}

function isKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
