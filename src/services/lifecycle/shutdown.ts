import { onTaskRemoved, quitApp } from 'app-lifecycle';

import { pendingListenWrites } from '@/features/player/listenRecorder';
import { AudioEngine } from '@/services/audio/AudioEngine';

/**
 * Stop everything when the app is swiped out of recents.
 *
 * A media service outlives its task by design, and Mufify's did: the
 * notification kept playing with no app behind it, the process stayed up, and
 * the next launch came back to a blank screen because the JavaScript runtime
 * had lost its host. Only "force stop" cleared it.
 *
 * **Backgrounding is untouched.** An app behind another app, or with the screen
 * off, keeps its task and never gets here — that is what background playback
 * depends on. This is the case where the user has thrown the app away.
 *
 * The order matters, and it is the whole reason this is in JavaScript rather
 * than three lines of Kotlin:
 *
 * 1. `stop()` ends the listen that is in progress and hands it to the recorder,
 *    the same way finishing a track does. Killing the process without this
 *    would lose whatever was playing at the moment of the swipe.
 * 2. The write is awaited. Recording is fire-and-forget everywhere else,
 *    because a statistics row must never sit between one track and the next;
 *    here, and only here, it is the last thing that happens before the process
 *    ends, so it is worth waiting for.
 * 3. Then the process goes. The native side does it anyway after a couple of
 *    seconds, so a runtime that is too wedged to reach step three still shuts
 *    down — it just may not have written that last row.
 *
 * **Installed at module scope, not from a component.** Removing the task
 * destroys the activity and React unmounts its tree, so an effect's cleanup
 * would tear this listener down a moment before the event it exists to catch.
 * The process outlives the tree — that is the whole bug — so the handler has to
 * outlive it too.
 */
let installed = false;

export function installShutdownOnTaskRemoved(): void {
  if (installed) return;
  installed = true;

  onTaskRemoved(() => {
    void (async () => {
      try {
        await AudioEngine.stop();
        await pendingListenWrites();
      } finally {
        quitApp();
      }
    })();
  });
}
