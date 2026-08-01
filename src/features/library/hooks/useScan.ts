import AudioTags from 'audio-tags';
import { Directory, Paths } from 'expo-file-system';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  addScanFolder,
  countUnenriched,
  listScanFolders,
  listUnenrichedUris,
  retireUnseen,
  saveEnriched,
  saveEnumerated,
} from '@/db/queries/scanning';
import { permissionErrorFor } from '@/services/scanner/permission';
import { getIgnoreShortFiles } from '@/services/settings';
import { isPickerDismissal } from '@/services/scanner/pickerError';
import { PRIMARY_VOLUME_ROOT, treeUriToPath } from '@/services/scanner/treeUri';
import {
  DEFAULT_SCAN_OPTIONS,
  enrichLibrary,
  enumerateLibrary,
  type ScanProgress,
  type ScannerPorts,
} from '@/services/scanner/scanner';

const IDLE: ScanProgress = { phase: 'idle', total: 0, processed: 0 };

/** What "short" means when the setting is on. Thirty seconds, as the copy says. */
const SHORT_FILE_MS = 30_000;

/**
 * Whether a scan may proceed, and if so whether this is the first time the app
 * has ever been allowed to read the library.
 */
type PermissionOutcome = 'already-granted' | 'granted-now' | 'denied';

/** Where music lands by default, and so always worth re-indexing. */
const DEFAULT_MUSIC_PATH = `${PRIMARY_VOLUME_ROOT}/Music`;

/** Where extracted artwork lives. Cache, not documents — it is rebuildable. */
function artworkDirectory(): string {
  const directory = new Directory(Paths.cache, 'artwork');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory.uri.replace('file://', '');
}

export interface UseScanResult {
  progress: ScanProgress;
  /** True while either stage is running. */
  isScanning: boolean;
  /**
   * True only for a scan the user pulled for.
   *
   * The refresh spinner is a response to a gesture, so it must not appear for a
   * scan started from the button — that already has the scan banner, and showing
   * both puts a spinner and a progress bar on screen for the same work.
   */
  isRefreshing: boolean;
  /**
   * Sweep MediaStore. Asks for the audio permission first if it does not have
   * it. Only ever called from an explicit user action — see the note in the
   * body about there being no automatic sweep.
   */
  scanLibrary: () => Promise<void>;
  /** Opens the system folder picker without starting an import yet. */
  pickFolder: () => Promise<string | null>;
  /** Adds a confirmed folder and runs both scan stages. */
  importFolder: (treeUri: string) => Promise<void>;
  /** True from confirmed folder import until enrichment has settled. */
  isFolderImporting: boolean;
  /**
   * Re-index the known folders and sweep again. This is the pull-to-refresh
   * path: a user who has just copied files in should not have to restart the
   * app, or wait for the system scanner to notice on its own.
   */
  rescan: () => Promise<void>;
  cancel: () => void;
}

/**
 * Drives the two-stage scan and exposes its progress.
 *
 * All three entry points — the scan button, the folder picker and pull to
 * refresh — go through the same pipeline. Manual adding is a first-class way to
 * fill the library, not a fallback for when the sweep disappoints: MediaStore
 * does not index files the system scanner has not seen, folders with a
 * `.nomedia`, or some SD card layouts, and this audience keeps music in exactly
 * those places.
 */
export function useScan(): UseScanResult {
  const [progress, setProgress] = useState<ScanProgress>(IDLE);
  const [pulled, setPulled] = useState(false);
  const [isFolderImporting, setFolderImporting] = useState(false);
  const cancelled = useRef(false);

  const ports: ScannerPorts = useMemo(
    () => ({
      countAudioFiles: (minDurationMs) => AudioTags.countAudioFiles(minDurationMs),
      queryAudioFiles: (options) => AudioTags.queryAudioFiles(options),
      readTags: (uris, options) => AudioTags.readTags(uris, options),
      saveEnumerated,
      saveEnriched,
      listUnenrichedUris,
      countUnenriched,
      retireUnseen,
      // Hand the frame back between batches so scrolling never stutters.
      // `requestIdleCallback` rather than InteractionManager, which RN 0.86
      // deprecates and warns about at runtime.
      yieldToUi: () =>
        new Promise<void>((resolve) => {
          requestIdleCallback(() => resolve(), { timeout: 250 });
        }),
    }),
    [],
  );

  const run = useCallback(async () => {
    cancelled.current = false;
    const controller = { isCancelled: () => cancelled.current };

    /*
     * Read at scan time, not captured at mount: the switch is in Settings and
     * the scan is started from the Library, so the value can legitimately change
     * between this hook mounting and the user pressing Scan.
     */
    const options = {
      ...DEFAULT_SCAN_OPTIONS,
      minDurationMs: getIgnoreShortFiles() ? SHORT_FILE_MS : DEFAULT_SCAN_OPTIONS.minDurationMs,
      artworkDirectory: artworkDirectory(),
    };

    const enumerated = await enumerateLibrary(ports, options, setProgress, controller);
    if (enumerated.phase !== 'done') return;

    await enrichLibrary(ports, options, setProgress, controller);
  }, [ports]);

  /**
   * Make sure the audio permission is actually granted, asking for it if it
   * has not been asked for yet.
   *
   * This has to happen before any MediaStore query. Without the grant a query
   * does not throw — under scoped storage it returns only rows this app owns,
   * which is none — so the scan completes with zero tracks and the library
   * shows its empty state. That is indistinguishable from "you have no music"
   * and was exactly the bug: picking a folder appeared to do nothing at all.
   *
   * Distinguishes "was already granted" from "granted just now" because the
   * caller acts differently: a first grant means the library has never been
   * swept, and something has to sweep it even if the user goes on to cancel
   * whatever they were doing.
   *
   * Sets the failure state itself on a denial, so callers only decide whether
   * to continue.
   */
  const ensurePermission = useCallback(async (): Promise<PermissionOutcome> => {
    if (await AudioTags.hasAudioPermission()) return 'already-granted';

    const error = permissionErrorFor(await AudioTags.requestAudioPermission());
    if (error === null) return 'granted-now';

    setProgress({ phase: 'failed', total: 0, processed: 0, error });
    return 'denied';
  }, []);

  const scanLibrary = useCallback(async () => {
    if ((await ensurePermission()) === 'denied') return;
    await run();
  }, [ensurePermission, run]);

  const pickFolder = useCallback(async (): Promise<string | null> => {
    // Ask before opening the picker, not after. The tree the picker returns
    // grants access to that tree only — the scan queries MediaStore, which
    // needs the audio permission — so without it the pick is wasted work and
    // the user has chosen a folder for nothing.
    const permission = await ensurePermission();
    if (permission === 'denied') return null;

    try {
      const directory = await Directory.pickDirectoryAsync();
      return directory.uri;
    } catch (error) {
      if (isPickerDismissal(error)) {
        return null;
      }
      setProgress({
        phase: 'failed',
        total: 0,
        processed: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }, [ensurePermission]);

  const importFolder = useCallback(
    async (treeUri: string) => {
      setFolderImporting(true);
      try {
        await addScanFolder(treeUri);
        // Index the folder rather than walking it — see ADR 007. A tree walk
        // would put SAF document URIs in `tracks.file_uri` alongside MediaStore
        // ones, and every consumer would then have to know which it was holding.
        await requestMediaScanFor(treeUri);
        await run();
      } finally {
        setFolderImporting(false);
      }
    },
    [run],
  );

  const runRescan = useCallback(async () => {
    if ((await ensurePermission()) === 'denied') return;

    // Re-index first, then sweep. Without the re-index a file copied a minute
    // ago is still invisible to MediaStore and the sweep would find nothing,
    // which reads as "the app is broken" rather than "Android has not looked
    // yet". See ADR 007.
    const folders = await listScanFolders();
    const paths = folders
      .map((folder) => treeUriToPath(folder.uri))
      .filter((path): path is string => path !== null);

    // Always re-index the standard music location, whether or not it was
    // explicitly added — it is where files land by default.
    const targets = [...new Set([...paths, DEFAULT_MUSIC_PATH])];

    try {
      await AudioTags.requestMediaScan(targets);
    } catch {
      // Best-effort. The sweep below still runs on whatever is indexed.
    }

    await run();
  }, [ensurePermission, run]);

  const rescan = useCallback(async () => {
    setPulled(true);
    try {
      await runRescan();
    } finally {
      setPulled(false);
    }
  }, [runRescan]);

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);

  /*
   * There is deliberately no automatic sweep.
   *
   * It used to start itself as soon as the permission was granted, which is how
   * a user's first launch became "the app froze". Two separate problems were
   * hiding behind each other: stage one held the JS thread for 859ms per page
   * (fixed in `saveEnumerated`), and nothing the user did had asked for the work
   * in the first place, so there was no moment where waiting felt earned.
   *
   * Scanning is now something the user presses, and the button says what it will
   * cost before it starts. That is a real behaviour change, not only a
   * performance one: a library scan reads every audio file on the device, and
   * doing that unannounced on launch is the sort of thing this app exists not to
   * do. See docs/adr/010-scanning-is-user-initiated.md.
   *
   * The launch cost of *not* scanning is zero, and a library that has already
   * been scanned is already in SQLite — the list paints from the database with
   * no MediaStore involvement at all.
   */

  const isScanning = progress.phase === 'enumerating' || progress.phase === 'enriching';

  return {
    progress,
    isScanning,
    isRefreshing: pulled && isScanning,
    scanLibrary,
    pickFolder,
    importFolder,
    isFolderImporting,
    rescan,
    cancel,
  };
}

/**
 * Point the system scanner at a picked folder.
 *
 * The picker hands back a SAF tree URI, which the scanner cannot take — it
 * wants filesystem paths. The common shapes are convertible; the ones that are
 * not simply fall through, and the user still gets the normal MediaStore
 * sweep rather than an error about something they cannot fix.
 */
async function requestMediaScanFor(treeUri: string): Promise<void> {
  const path = treeUriToPath(treeUri);
  if (!path) return;

  try {
    await AudioTags.requestMediaScan([path]);
  } catch {
    // Indexing is best-effort; the sweep below still runs.
  }
}
