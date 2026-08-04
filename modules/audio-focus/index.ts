import { requireOptionalNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

/** Which way a remote asked to move through the queue. */
export type MediaSkipDirection = 'next' | 'previous';

interface AudioFocusEventsModule {
  /**
   * Fires just before Android reroutes playback to the speaker — headphones
   * unplugged, Bluetooth disconnected. The contract is that a media app
   * pauses; nothing else in the stack does it for us.
   */
  addListener(event: 'audioBecomingNoisy', listener: () => void): EventSubscription;
  /**
   * Fires when something outside the app asks for the next or previous track —
   * a Bluetooth remote, a headset button, the notification, a car.
   */
  addListener(
    event: 'mediaSkip',
    listener: (payload: { direction: MediaSkipDirection }) => void,
  ): EventSubscription;
}

/**
 * Optional, not required.
 *
 * `requireNativeModule` throws at import time, and this module is imported by
 * `AudioEngine` → `usePlayback` → `MiniPlayer` → the tab layout. A throw there
 * takes down every route in the app: the whole thing failed to render with
 * "Cannot find native module", and the real symptom — no headphone-unplug
 * handling — was a footnote by comparison.
 *
 * That is exactly what a dev client built before this module existed does, and
 * having one on a phone is entirely normal. So a missing module degrades to
 * "no becoming-noisy events" rather than to a blank app.
 */
const AudioFocusEvents = requireOptionalNativeModule<AudioFocusEventsModule>('AudioFocusEvents');

/**
 * Subscribe to the route-change warning, if this build has the module.
 *
 * Returns a no-op unsubscribe when it does not, so callers need no branch.
 */
export function onAudioBecomingNoisy(listener: () => void): () => void {
  const subscription = AudioFocusEvents?.addListener('audioBecomingNoisy', listener);
  return () => subscription?.remove();
}

/**
 * Subscribe to skip requests from outside the app, if this build has them.
 *
 * The queue is in JavaScript, so nothing native can answer these — expo-audio's
 * `MediaSession` announces them and refuses them, and the engine decides what
 * next and previous mean. See `docs/adr/017`.
 */
export function onMediaSkip(listener: (direction: MediaSkipDirection) => void): () => void {
  /*
   * Guarded, and not only against the module being absent. A dev client built
   * before this event existed *has* the module and rejects the name, which
   * throws — and this is called from `AudioEngine.configure`, inside the try
   * that wraps loading a track. An unguarded throw there means the player is
   * never created and nothing plays at all, which is a great deal worse than a
   * Bluetooth remote whose skip buttons do nothing.
   */
  try {
    const subscription = AudioFocusEvents?.addListener('mediaSkip', ({ direction }) =>
      listener(direction),
    );
    return () => subscription?.remove();
  } catch {
    return () => undefined;
  }
}

/** Whether this build can warn about audio routing changes at all. */
export const hasAudioFocusEvents = AudioFocusEvents !== null;
