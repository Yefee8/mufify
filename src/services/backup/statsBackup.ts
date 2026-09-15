import { useSyncExternalStore } from 'react';

import { Directory, File, Paths } from 'expo-file-system';

import { onUserDataChanged } from '@/db/changes';
import { listScanFolders } from '@/db/queries/scanning';
import {
  applyRestore,
  collectBackup,
  countPlayEvents,
  coverFileName,
  libraryForRestore,
  playlistCovers,
} from '@/db/queries/statsBackup';
import {
  getStatsBackupAt,
  getStatsBackupEnabled,
  getStatsBackupFolder,
  setStatsBackupAt,
  setStatsBackupEnabled,
  setStatsBackupFolder,
} from '@/services/settings';
import {
  parseBackup,
  planRestore,
  serializeBackup,
  type RestorePlan,
} from '@/services/stats/backup';

import { readBackupFile, readCoverFile, writeBackupFile, writeCoverFile } from './backupFile';

/**
 * Keeping the listening history somewhere the app does not own.
 *
 * The database goes with the app — an uninstall, a "clear data", a build
 * signed with another key that has to be removed first — and the history is
 * the one table in it that cannot be rebuilt by scanning. So it is written,
 * as a file, into a folder the user granted: the first folder they added to
 * the library, or one they picked for this in Settings. After a reinstall the
 * user adds the folder again, because they have to anyway, and the history
 * comes back with it.
 *
 * This is the port between the pure format (`services/stats/backup`), the
 * database (`db/queries/statsBackup`) and the file (`./backupFile`). It owns
 * the *when*: a write is scheduled after every recorded listen, every heart
 * and every playlist edit, and coalesced, so a session is one write, not one
 * per change; and a restore runs when a folder is added to an empty history,
 * or when the user asks. Playlist covers travel as files beside the JSON.
 */

/** How long after the last listen the file is written. */
const WRITE_DELAY_MS = 20_000;

export interface StatsBackupStatus {
  enabled: boolean;
  /** The folder in use — chosen, or the library's first — or null for none. */
  folderUri: string | null;
  /** Whether that folder was chosen for this rather than borrowed. */
  chosen: boolean;
  lastBackupAt: number | null;
  busy: boolean;
}

export interface RestoreOutcome {
  /** Listens written. Zero with `found` true means nothing new was in it. */
  restored: number;
  /** Whether a backup file was there at all. */
  found: boolean;
  /** Tracks in the file that the library does not hold yet. */
  unmatched: number;
  /** Playlists created. Ones that already existed are merged, not counted. */
  playlists: number;
}

let status: StatsBackupStatus = {
  enabled: getStatsBackupEnabled(),
  folderUri: getStatsBackupFolder(),
  chosen: getStatsBackupFolder() !== null,
  lastBackupAt: getStatsBackupAt(),
  busy: false,
};
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight: Promise<void> = Promise.resolve();

function publish(next: Partial<StatsBackupStatus>): void {
  status = { ...status, ...next };
  for (const listener of listeners) listener();
}

// Playlists and hearts announce themselves from the query layer, which cannot
// import this module. Listens do not: their recorder asks directly.
onUserDataChanged(() => scheduleStatsBackup());

/** The folder the file goes in: the chosen one, else the library's first. */
export async function resolveBackupFolder(): Promise<string | null> {
  const chosen = getStatsBackupFolder();
  if (chosen !== null) return chosen;
  const folders = await listScanFolders();
  return folders[0]?.uri ?? null;
}

/**
 * Note that the history changed. The write happens a little later, once,
 * however many listens arrive in the meantime — and never in the way of the
 * next track, which is loading by the time a listen is recorded.
 */
export function scheduleStatsBackup(): void {
  if (!status.enabled) return;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void backupStatsNow();
  }, WRITE_DELAY_MS);
}

/** Write the file now. Safe to call while a write is pending; it joins it. */
export function backupStatsNow(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  inFlight = inFlight.then(writeOnce, writeOnce);
  return inFlight;
}

async function writeOnce(): Promise<void> {
  const folderUri = await resolveBackupFolder();
  publish({ folderUri, chosen: getStatsBackupFolder() !== null });
  if (folderUri === null) return;

  publish({ busy: true });
  try {
    const backup = await collectBackup();
    writeBackupFile(folderUri, serializeBackup(backup));
    // Covers after the file, so a file naming a cover that is not there yet
    // is a window of a moment rather than a state.
    for (const cover of await playlistCovers()) {
      await writeCoverFile(folderUri, coverFileName(cover.createdAt), cover.path);
    }
    setStatsBackupAt(backup.createdAt);
    publish({ lastBackupAt: backup.createdAt });
  } catch (error) {
    // A folder on an unmounted card, a grant that was revoked — the next
    // scheduled write tries again, and the history is still in the database.
    if (__DEV__) console.warn('Statistics backup failed:', error);
  } finally {
    publish({ busy: false });
  }
}

/** Resolves once any write in progress has finished. For shutdown. */
export function pendingStatsBackup(): Promise<void> {
  return inFlight;
}

/**
 * Read the file in `folderUri` and add what the database does not hold.
 *
 * Idempotent: the plan skips every listen already present, so restoring the
 * same file twice, or a file written by this very install, changes nothing.
 */
export async function restoreStatsFrom(folderUri: string): Promise<RestoreOutcome> {
  publish({ busy: true });
  try {
    const text = await readBackupFile(folderUri);
    const backup = text === null ? null : parseBackup(text);
    if (backup === null) return { restored: 0, found: false, unmatched: 0, playlists: 0 };

    const plan = planRestore(backup, await libraryForRestore());
    const covers = await bringCoversIn(folderUri, plan);
    await applyRestore(plan, covers);
    return {
      restored: plan.events.length,
      found: true,
      unmatched: plan.unmatchedTracks,
      playlists: plan.playlists.filter((item) => item.action === 'create').length,
    };
  } finally {
    publish({ busy: false });
  }
}

/**
 * Covers for the playlists about to be created, copied into the app's own
 * documents first — the same place a chosen cover lives — so the rows point
 * at files the app owns. A cover that is missing from the backup leaves the
 * playlist with the mosaic, which is what it would have had anyway.
 */
async function bringCoversIn(folderUri: string, plan: RestorePlan): Promise<Map<string, string>> {
  const covers = new Map<string, string>();
  const directory = new Directory(Paths.document, 'playlist-covers');
  if (!directory.exists) directory.create({ intermediates: true });

  for (const item of plan.playlists) {
    if (item.action !== 'create' || item.playlist.cover === null) continue;
    const target = new File(directory, `restored-${item.playlist.createdAt}-${Date.now()}.jpg`);
    try {
      if (await readCoverFile(folderUri, item.playlist.cover, target.uri)) {
        covers.set(item.playlist.cover, target.uri.replace('file://', ''));
      }
    } catch (error) {
      if (__DEV__) console.warn('Playlist cover could not be restored:', error);
    }
  }
  return covers;
}

/**
 * A folder was just added to the library and scanned.
 *
 * If the history is empty and the folder holds a backup, this is the moment
 * after a reinstall, and the history comes back without anyone having to know
 * there was a file. A history that is not empty is left alone: adding a
 * second folder should not quietly merge whatever an old backup in it says.
 */
export async function restoreStatsAfterImport(folderUri: string): Promise<RestoreOutcome | null> {
  if ((await countPlayEvents()) > 0) return null;
  try {
    return await restoreStatsFrom(folderUri);
  } catch (error) {
    if (__DEV__) console.warn('Statistics restore failed:', error);
    return null;
  }
}

export function setStatsBackupOn(enabled: boolean): void {
  setStatsBackupEnabled(enabled);
  publish({ enabled });
  if (enabled) scheduleStatsBackup();
}

/** Use this folder from now on, and write to it straight away. */
export function chooseStatsBackupFolder(folderUri: string): Promise<void> {
  setStatsBackupFolder(folderUri);
  publish({ folderUri, chosen: true });
  return backupStatsNow();
}

export function getStatsBackupStatus(): StatsBackupStatus {
  return status;
}

export function subscribeStatsBackup(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The status, live. Resolves the folder once, in case none was chosen. */
export function useStatsBackupStatus(): StatsBackupStatus {
  return useSyncExternalStore(subscribeStatsBackup, getStatsBackupStatus, getStatsBackupStatus);
}

/** Make the borrowed folder known to the status without writing anything. */
export async function refreshStatsBackupFolder(): Promise<void> {
  const folderUri = await resolveBackupFolder();
  publish({ folderUri, chosen: getStatsBackupFolder() !== null });
}
