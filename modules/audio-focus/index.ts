import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

declare class AudioFocusEventsModule {
  /**
   * Fires just before Android reroutes playback to the speaker — headphones
   * unplugged, Bluetooth disconnected. The contract is that a media app
   * pauses; nothing else in the stack does it for us.
   */
  addListener(event: 'audioBecomingNoisy', listener: () => void): EventSubscription;
}

const AudioFocusEvents = requireNativeModule<AudioFocusEventsModule>('AudioFocusEvents');

export default AudioFocusEvents;
