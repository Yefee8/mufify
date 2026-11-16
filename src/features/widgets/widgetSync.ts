import {
  hasWidgets,
  onWidgetAction,
  setWidgetNowPlaying,
  takePendingWidgetAction,
} from 'mufify-widgets';

import { whenSessionRestored } from '@/features/player/sessionPersistence';
import { i18n } from '@/i18n';
import { AudioEngine } from '@/services/audio/AudioEngine';
import { nowPlayingSnapshot, parseWidgetAction } from '@/services/widgets/widgetState';

import { performWidgetAction } from './widgetActions';

/**
 * Keep the now-playing widget current, and answer what is pressed on it.
 *
 * Subscribed to the engine directly rather than through React: music keeps
 * playing, and tracks keep changing, while there is no screen mounted to
 * notice — and the widget is how the user sees that. The engine reports its
 * position several times a second; the snapshot leaves position out, so
 * almost every one of those builds the same string and stops at the compare.
 *
 * The press that opened the app — a widget button pressed while the app was
 * not running — waits for the saved session to be back, then runs once.
 *
 * Called once from the root layout, after migrations. Returns the unsubscribe.
 */
export function startWidgetSync(): () => void {
  if (!hasWidgets) return () => undefined;

  let disposed = false;
  let last = '';

  const push = (): void => {
    const snapshot = nowPlayingSnapshot(
      AudioEngine.getQueueSnapshot(),
      AudioEngine.getState(),
      i18n.t('common.unknownArtist'),
    );
    const json = JSON.stringify(snapshot);
    if (json === last) return;
    last = json;
    setWidgetNowPlaying(snapshot);
  };

  const run = (raw: unknown): void => {
    const action = parseWidgetAction(raw);
    if (action !== null) void performWidgetAction(action);
  };

  const unsubscribers = [
    onWidgetAction(run),
    AudioEngine.subscribe(push),
    AudioEngine.subscribeQueue(push),
  ];
  // The unknown-artist name is in the snapshot; a language change rewrites it.
  const onLanguage = (): void => push();
  i18n.on('languageChanged', onLanguage);

  void whenSessionRestored().then(() => {
    if (disposed) return;
    push();
    run(takePendingWidgetAction());
  });

  return () => {
    disposed = true;
    i18n.off('languageChanged', onLanguage);
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}
