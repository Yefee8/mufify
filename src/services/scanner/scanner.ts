import type { MediaStoreTrack, TrackTags } from 'audio-tags';

import { fromMediaStore, fromTags, type EnrichedFields, type ScannedTrack } from './trackMapping';

/**
 * The two-stage scan.
 *
 * Stage one enumerates everything MediaStore already knows in pages and writes
 * it straight down, so the library is usable within a second or two. Stage two
 * opens files in the background to fill in tags, the spec strip and artwork.
 *
 * Every dependency is injected. That is not ceremony — it is what lets the
 * whole pipeline, including cancellation and the failure paths, be tested
 * without a device.
 */

export type ScanPhase = 'idle' | 'enumerating' | 'enriching' | 'done' | 'cancelled' | 'failed';

export interface ScanProgress {
  phase: ScanPhase;
  /** Files discovered. Zero until the first count returns. */
  total: number;
  /** Files written in the current stage. */
  processed: number;
  /** Present only when `phase` is 'failed'. */
  error?: string;
}

export interface ScanOptions {
  /** Ignore anything shorter than this. The "ignore short files" setting. */
  minDurationMs: number;
  /** Rows per MediaStore page. */
  enumerateBatchSize: number;
  /** Files opened per enrich batch. */
  enrichBatchSize: number;
  artworkDirectory: string;
}

export const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  minDurationMs: 5_000,
  // Big enough that paging is not the bottleneck, small enough that the first
  // rows land almost immediately.
  enumerateBatchSize: 500,
  // Opening files is expensive; a small batch keeps cancellation responsive.
  enrichBatchSize: 25,
  artworkDirectory: '',
};

export interface ScannerPorts {
  countAudioFiles(minDurationMs: number): Promise<number>;
  queryAudioFiles(options: {
    limit: number;
    offset: number;
    minDurationMs?: number;
  }): Promise<MediaStoreTrack[]>;
  readTags(uris: string[], options: { artworkDirectory: string }): Promise<TrackTags[]>;

  /** Batched insert-or-update, keyed on file URI. */
  saveEnumerated(rows: ScannedTrack[]): Promise<void>;
  saveEnriched(rows: { fileUri: string; fields: EnrichedFields }[]): Promise<void>;
  /** URIs that stage two has not reached yet. */
  listUnenrichedUris(limit: number): Promise<string[]>;

  /** Hand the frame back so scrolling never stutters mid-scan. */
  yieldToUi(): Promise<void>;
}

export interface ScanController {
  isCancelled(): boolean;
}

const NEVER_CANCELLED: ScanController = { isCancelled: () => false };

/**
 * Stage one. Returns as soon as MediaStore is exhausted; the caller is
 * expected to start stage two after the first paint.
 */
export async function enumerateLibrary(
  ports: ScannerPorts,
  options: ScanOptions,
  onProgress: (progress: ScanProgress) => void,
  controller: ScanController = NEVER_CANCELLED,
): Promise<ScanProgress> {
  let progress: ScanProgress = { phase: 'enumerating', total: 0, processed: 0 };
  onProgress(progress);

  try {
    const total = await ports.countAudioFiles(options.minDurationMs);
    progress = { ...progress, total };
    onProgress(progress);

    let offset = 0;
    for (;;) {
      if (controller.isCancelled()) return finish(progress, 'cancelled', onProgress);

      const page = await ports.queryAudioFiles({
        limit: options.enumerateBatchSize,
        offset,
        minDurationMs: options.minDurationMs,
      });
      if (page.length === 0) break;

      await ports.saveEnumerated(page.map(fromMediaStore));

      offset += page.length;
      progress = { ...progress, processed: offset };
      onProgress(progress);

      await ports.yieldToUi();

      // A short final page means the cursor is exhausted; asking again would
      // cost a query to learn nothing.
      if (page.length < options.enumerateBatchSize) break;
    }

    return finish({ ...progress, total: Math.max(progress.total, offset) }, 'done', onProgress);
  } catch (error) {
    return fail(progress, error, onProgress);
  }
}

/**
 * Stage two. Opens files in small batches, writing each batch before starting
 * the next so a cancelled or crashed scan keeps everything it already did.
 */
export async function enrichLibrary(
  ports: ScannerPorts,
  options: ScanOptions,
  onProgress: (progress: ScanProgress) => void,
  controller: ScanController = NEVER_CANCELLED,
): Promise<ScanProgress> {
  let progress: ScanProgress = { phase: 'enriching', total: 0, processed: 0 };
  onProgress(progress);

  try {
    let processed = 0;

    for (;;) {
      if (controller.isCancelled()) return finish(progress, 'cancelled', onProgress);

      const uris = await ports.listUnenrichedUris(options.enrichBatchSize);
      if (uris.length === 0) break;

      const tags = await ports.readTags(uris, {
        artworkDirectory: options.artworkDirectory,
      });

      const rows = tags.flatMap((tag) => {
        const fields = fromTags(tag);
        // A file that would not open is skipped, not retried forever — it
        // still counts as processed so the progress bar can finish.
        return fields ? [{ fileUri: tag.uri, fields }] : [];
      });

      await ports.saveEnriched(rows);

      processed += uris.length;
      progress = { ...progress, processed, total: processed };
      onProgress(progress);

      await ports.yieldToUi();
    }

    return finish({ ...progress, processed, total: processed }, 'done', onProgress);
  } catch (error) {
    return fail(progress, error, onProgress);
  }
}

function finish(
  progress: ScanProgress,
  phase: ScanPhase,
  onProgress: (progress: ScanProgress) => void,
): ScanProgress {
  const next: ScanProgress = { ...progress, phase };
  onProgress(next);
  return next;
}

function fail(
  progress: ScanProgress,
  error: unknown,
  onProgress: (progress: ScanProgress) => void,
): ScanProgress {
  const message = error instanceof Error ? error.message : String(error);
  const next: ScanProgress = { ...progress, phase: 'failed', error: message };
  onProgress(next);
  return next;
}
