import { requireOptionalNativeModule } from 'expo-modules-core';

interface AppLifecycleNativeModule {
  addListener(event: 'taskRemoved', listener: () => void): { remove: () => void };
  /** End the process. Everything that had to be written must be written first. */
  quit(): void;
}

/**
 * Optional, like the other local modules: a dev client built before this
 * existed is a normal thing to have on a phone, and this is imported from the
 * root layout. A missing module means the old behaviour, not a blank app.
 */
const AppLifecycle = requireOptionalNativeModule<AppLifecycleNativeModule>('AppLifecycle');

/**
 * Fires when the app is swiped out of the recents list.
 *
 * Not when it is backgrounded, and not when the screen goes off — those keep
 * the task, and playing in the background depends on them keeping it. Only
 * removing the task gets here.
 */
export function onTaskRemoved(listener: () => void): () => void {
  try {
    const subscription = AppLifecycle?.addListener('taskRemoved', listener);
    return () => subscription?.remove();
  } catch {
    return () => undefined;
  }
}

/** End the process. The native side does this anyway if nobody calls it. */
export function quitApp(): void {
  AppLifecycle?.quit();
}

export const hasAppLifecycle = AppLifecycle !== null;
