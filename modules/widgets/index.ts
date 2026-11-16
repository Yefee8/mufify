import { requireOptionalNativeModule } from 'expo-modules-core';

/** One row of "up next", with what was there so a stale press can be caught. */
export interface WidgetQueueRow {
  index: number;
  trackId: number;
  title: string;
  artist: string;
}

/** Everything the now-playing widget draws. */
export interface WidgetNowPlaying {
  hasTrack: boolean;
  title: string;
  artist: string;
  /** Bare path in the files directory, as the library stores it. */
  artworkPath: string | null;
  playing: boolean;
  upNext: WidgetQueueRow[];
}

/** Something a collection widget can be set to. */
export interface WidgetCollection {
  /** `library`, `liked` or `playlist:<id>`. See `services/widgets`. */
  key: string;
  name: string;
  /** "128 tracks", already formatted. */
  meta: string;
  artworkPath: string | null;
  /** The route that opens it, without the scheme. Null for the library tab. */
  link: string | null;
}

/** The words the widgets say, in the app's language rather than the phone's. */
export interface WidgetStrings {
  nothingPlaying: string;
  openApp: string;
  upNext: string;
  queueEnd: string;
  play: string;
  pause: string;
  next: string;
  previous: string;
  shuffle: string;
  library: string;
  pickTitle: string;
  missing: string;
}

export interface WidgetAppearance {
  theme: 'system' | 'light' | 'dark';
  strings: WidgetStrings;
}

/** A press, as the native side reports it. Validated in `services/widgets`. */
export interface RawWidgetAction {
  type: string;
  collection: string | null;
  index: number;
  trackId: number;
}

interface WidgetsNativeModule {
  addListener(
    event: 'widgetAction',
    listener: (action: RawWidgetAction) => void,
  ): { remove: () => void };
  setNowPlaying(json: string): void;
  setCollections(json: string): void;
  setAppearance(json: string): void;
  takePendingAction(): string | null;
}

/**
 * Optional, like the other local modules: a dev client built before the
 * widgets existed is a normal thing to have on a phone, and then there are
 * simply no widgets to keep up to date.
 */
const Widgets = requireOptionalNativeModule<WidgetsNativeModule>('MufifyWidgets');

export const hasWidgets = Widgets !== null;

/*
 * JSON across the bridge rather than records: the native side keeps exactly
 * this string and compares it with the last one, which is what makes a call
 * that changes nothing free.
 */

/** What is playing and what follows. Unchanged snapshots cost one string compare. */
export function setWidgetNowPlaying(state: WidgetNowPlaying): void {
  call(() => Widgets?.setNowPlaying(JSON.stringify(state)));
}

/** Everything a collection widget may show, in the order the picker lists it. */
export function setWidgetCollections(collections: readonly WidgetCollection[]): void {
  call(() => Widgets?.setCollections(JSON.stringify(collections)));
}

export function setWidgetAppearance(appearance: WidgetAppearance): void {
  call(() => Widgets?.setAppearance(JSON.stringify(appearance)));
}

/** Presses on a widget while the app is running. */
export function onWidgetAction(listener: (action: RawWidgetAction) => void): () => void {
  try {
    const subscription = Widgets?.addListener('widgetAction', listener);
    return () => subscription?.remove();
  } catch {
    return () => undefined;
  }
}

/** The press that opened the app, if one did in the last minute. Once. */
export function takePendingWidgetAction(): unknown {
  try {
    const json = Widgets?.takePendingAction() ?? null;
    return json === null ? null : (JSON.parse(json) as unknown);
  } catch {
    return null;
  }
}

/**
 * A widget is decoration. If it cannot be updated, the app carries on — the
 * next change will try again.
 */
function call(body: () => void): void {
  try {
    body();
  } catch {
    // Deliberately quiet; see above.
  }
}
