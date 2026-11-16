import { AppState } from 'react-native';

import {
  clearPlaybackSession,
  loadPlaybackSession,
  savePlaybackPosition,
  savePlaybackSession,
} from '@/db/queries/playbackSession';
import { getTracksByIds } from '@/db/queries/tracks';
import { AudioEngine } from '@/services/audio/AudioEngine';
import { rebuildSession } from '@/services/audio/session';
import type { PlaybackState, PlayableTrack } from '@/services/audio/types';

import { toPlayable } from './toPlayable';

/** Queue edits come in bursts — a drag, a play-next of a whole album. */
const QUEUE_SAVE_DELAY_MS = 1_000;
/** While playing, the position is written this often; pausing writes it at once. */
const POSITION_SAVE_EVERY_MS = 10_000;

let markRestored: () => void = () => undefined;
const restored = new Promise<void>((resolve) => {
  markRestored = resolve;
});

/**
 * Resolves once the saved session has been handed back to the engine — or
 * found missing. For what acts on the queue at launch, a widget's press that
 * opened the app: acting before this would play into a queue about to be
 * replaced.
 */
export function whenSessionRestored(): Promise<void> {
  return restored;
}

/**
 * Keep what is playing across restarts.
 *
 * The queue lived only in memory, so the moment the process ended — MIUI
 * reclaiming a backgrounded app, a swipe out of recents, a reboot — the
 * mini player was gone and the song with it, however recently it had been
 * playing. Now the queue is written when it changes and the position as it
 * moves, and on launch the session comes back paused, where it was left.
 *
 * Only clearing the queue forgets it. Stopping does not: swiping the app away
 * ends playback (ADR 020), and the song should still be there to resume.
 *
 * Restores first, then listens, and returns the unsubscribe. Called once, from
 * the root layout, after migrations have run.
 */
export function startSessionPersistence(): () => void {
  let disposed = false;
  let queueTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPositionSave = 0;

  const saveQueue = (): void => {
    queueTimer = null;
    const { tracks, index } = AudioEngine.getQueueSnapshot();
    if (tracks.length === 0) {
      void clearPlaybackSession();
      return;
    }
    // Stopped (index -1) keeps the last session that had a current track.
    if (index < 0) return;
    const shape = AudioEngine.getSessionShape();
    void savePlaybackSession({
      queue: ids(tracks),
      sourceQueue: ids(shape.sourceQueue),
      queueIndex: index,
      positionMs: AudioEngine.getState().positionMs,
      shuffled: shape.shuffled,
      shuffleAlgorithm: shape.shuffleAlgorithm,
      repeat: AudioEngine.getRepeat(),
      sourceType: shape.source.type,
      sourceId: shape.source.id ?? null,
    });
    lastPositionSave = Date.now();
  };

  const savePosition = (): void => {
    const { index } = AudioEngine.getQueueSnapshot();
    if (index < 0) return;
    lastPositionSave = Date.now();
    void savePlaybackPosition(index, AudioEngine.getState().positionMs, AudioEngine.getRepeat());
  };

  const onQueue = (): void => {
    if (queueTimer !== null) clearTimeout(queueTimer);
    queueTimer = setTimeout(saveQueue, QUEUE_SAVE_DELAY_MS);
  };

  let previousPhase: PlaybackState['phase'] = AudioEngine.getState().phase;
  const onState = (state: PlaybackState): void => {
    const paused = state.phase === 'paused' && previousPhase !== 'paused';
    previousPhase = state.phase;
    if (
      paused ||
      (state.phase === 'playing' && Date.now() - lastPositionSave >= POSITION_SAVE_EVERY_MS)
    ) {
      savePosition();
    }
  };

  const unsubscribers: (() => void)[] = [];
  void restore().finally(() => {
    markRestored();
    if (disposed) return;
    unsubscribers.push(AudioEngine.subscribeQueue(onQueue), AudioEngine.subscribe(onState));
  });

  const appState = AppState.addEventListener('change', (next) => {
    // The last chance before the system may end the process unannounced.
    if (next === 'background') savePosition();
  });

  return () => {
    disposed = true;
    if (queueTimer !== null) clearTimeout(queueTimer);
    appState.remove();
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

/** Read the saved session and hand it to the engine, paused. */
async function restore(): Promise<void> {
  const stored = await loadPlaybackSession();
  if (stored === null) return;
  const found = await getTracksByIds([...stored.queue, ...stored.sourceQueue]);
  const playable = new Map<number, PlayableTrack>();
  for (const [id, track] of found) playable.set(id, toPlayable(track));
  const session = rebuildSession(stored, playable);
  if (session === null) {
    await clearPlaybackSession();
    return;
  }
  AudioEngine.restore(session);
}

function ids(tracks: readonly PlayableTrack[]): number[] {
  return tracks.map((track) => track.id);
}
