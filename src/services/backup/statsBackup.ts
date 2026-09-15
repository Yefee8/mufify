import { useSyncExternalStore } from 'react';

import { listScanFolders } from '@/db/queries/scanning';
import {
  applyRestore,
  collectBackup,
  countPlayEvents,
  libraryForRestore,
} from '@/db/queries/statsBackup';
import {
  getStatsBackupAt,
  getStatsBackupEnabled,
  getStatsBackupFolder,
  setStatsBackupAt,
  setStatsBackupEnabled,
  setStatsBackupFolder,
} from '@/services/settings';
import { parseBackup, planRestore, serializeBackup } from '@/services/stats/backup';

import { readBackupFile, writeBackupFile } from './backupFile';

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
 * the *when*: a write is scheduled after every recorded listen and coalesced,
 * so a listening session is one write, not one per track; and a restore runs
 * when a folder is added to an empty history, or when the user asks.
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
    if (backup === null) return { restored: 0, found: false, unmatched: 0 };

    const { library, existing } = await libraryForRestore();
    const plan = planRestore(backup, library, existing);
    await applyRestore(plan);
    return { restored: plan.events.length, found: true, unmatched: plan.unmatchedTracks };
  } finally {
    publish({ busy: false });
  }
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
