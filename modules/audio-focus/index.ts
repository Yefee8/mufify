import { requireOptionalNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

interface AudioFocusEventsModule {
  /**
   * Fires just before Android reroutes playback to the speaker — headphones
   * unplugged, Bluetooth disconnected. The contract is that a media app
   * pauses; nothing else in the stack does it for us.
   */
  addListener(event: 'audioBecomingNoisy', listener: () => void): EventSubscription;
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

/** Whether this build can warn about audio routing changes at all. */
export const hasAudioFocusEvents = AudioFocusEvents !== null;
