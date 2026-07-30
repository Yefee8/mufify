import { requireNativeModule } from 'expo-modules-core';

import type {
  MediaStoreQueryOptions,
  MediaStoreTrack,
  ReadTagsOptions,
  TrackTags,
} from './src/AudioTags.types';

declare class AudioTagsModuleType {
  /** How many audio files MediaStore currently knows about. */
  countAudioFiles(minDurationMs: number): Promise<number>;

  /** One page of the MediaStore cursor. All columns, one query. */
  queryAudioFiles(options: MediaStoreQueryOptions): Promise<MediaStoreTrack[]>;

  /**
   * Open each file, read its tags and technical fields, and write any
   * embedded artwork to disk. Batched so the bridge crossing is per chunk,
   * not per file.
   */
  readTags(uris: string[], options: ReadTagsOptions): Promise<TrackTags[]>;

  /** Whether READ_MEDIA_AUDIO (or its pre-33 equivalent) has been granted. */
  hasAudioPermission(): Promise<boolean>;
}

const AudioTagsModule = requireNativeModule<AudioTagsModuleType>('AudioTags');

export default AudioTagsModule;
export type {
  MediaStoreQueryOptions,
  MediaStoreTrack,
  ReadTagsOptions,
  TrackTags,
} from './src/AudioTags.types';
