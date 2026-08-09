import { requireNativeModule } from 'expo-modules-core';

import type {
  AudioPermissionResult,
  MediaStoreQueryOptions,
  MediaStoreTrack,
  ReadTagsOptions,
  TrackTags,
} from './src/AudioTags.types';

declare class AudioTagsModuleType {
  /** How many audio files MediaStore currently knows about. */
  countAudioFiles(minDurationMs: number, pathPrefix?: string | null): Promise<number>;

  /** One page of the MediaStore cursor. All columns, one query. */
  queryAudioFiles(options: MediaStoreQueryOptions): Promise<MediaStoreTrack[]>;

  /**
   * Open each file, read its tags and technical fields, and write any
   * embedded artwork to disk. Batched so the bridge crossing is per chunk,
   * not per file.
   */
  readTags(uris: string[], options: ReadTagsOptions): Promise<TrackTags[]>;

  /**
   * Embedded lyrics for one file, raw, or null when it carries none.
   *
   * Reads only the metadata at the head of the file, so it is cheap enough to
   * ask per track rather than to store for a whole library. FLAC's Vorbis
   * comment and MP3's `USLT`; anything else answers null.
   */
  readLyrics(uri: string): Promise<string | null>;

  /** Whether READ_MEDIA_AUDIO (or its pre-33 equivalent) has been granted. */
  hasAudioPermission(): Promise<boolean>;

  /**
   * Show the system permission dialog and report what the user chose.
   *
   * Required before the first MediaStore query: without the grant, a query
   * does not fail, it returns nothing — a scan that "succeeds" with zero
   * tracks and an empty library that looks like a broken feature.
   */
  requestAudioPermission(): Promise<AudioPermissionResult>;

  /**
   * Ask the platform to index these filesystem paths and wait for it.
   *
   * MediaStore only knows about files its scanner has visited, so a file
   * copied over USB or restored from a backup can sit on disk unseen. This
   * asks directly instead of waiting. Resolves with the URIs the scanner
   * produced — an empty array means it indexed nothing.
   */
  requestMediaScan(paths: string[]): Promise<string[]>;
}

const AudioTagsModule = requireNativeModule<AudioTagsModuleType>('AudioTags');

export default AudioTagsModule;
export type {
  AudioPermissionResult,
  MediaStoreQueryOptions,
  MediaStoreTrack,
  ReadTagsOptions,
  TrackTags,
} from './src/AudioTags.types';
