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
 */

export const BACKUP_FORMAT = 'mufify-statistics';
export const BACKUP_VERSION = 1;

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

export interface StatsBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: number;
  tracks: BackupTrack[];
  events: BackupEvent[];
  favourites: BackupFavourite[];
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
  if (parsed.format !== BACKUP_FORMAT || parsed.version !== BACKUP_VERSION) return null;
  if (!Array.isArray(parsed.tracks) || !Array.isArray(parsed.events)) return null;
  if (!Array.isArray(parsed.favourites)) return null;

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

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : 0,
    tracks,
    events,
    favourites,
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

export interface RestorePlan {
  events: RestorableEvent[];
  favourites: { trackId: number; favoriteAt: number | null }[];
  /** Backup tracks with no counterpart in the library. Their listens wait. */
  unmatchedTracks: number;
  /** Events already in the database, skipped. */
  alreadyPresent: number;
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
export function planRestore(
  backup: StatsBackup,
  library: readonly LibraryTrack[],
  existing: ReadonlySet<string>,
): RestorePlan {
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

  return { events, favourites, unmatchedTracks, alreadyPresent };
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
