/**
 * Transient confirmations.
 *
 * A module-level store rather than a React context, for the same reason the
 * audio engine is one: a context provider high in the tree re-renders everything
 * under it whenever a toast appears, and the whole point of a toast is that it
 * does not disturb what you were doing. Only `<Toaster />` subscribes.
 *
 * Toasts say what *happened*, never what is happening — "Added to queue", not
 * "Adding…". Anything slow enough to need a progress indicator needs a real one,
 * not a message that disappears.
 */

export interface Toast {
  /** Monotonic, so a repeated message still re-triggers the animation. */
  id: number;
  /** Already translated. One short sentence. */
  message: string;
}

type Listener = (toast: Toast | null) => void;

/** Long enough to read a short sentence, short enough not to linger. */
const VISIBLE_MS = 2_600;

let current: Toast | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener(current);
}

/**
 * Show a message.
 *
 * A new toast replaces the one on screen rather than queueing behind it.
 * Queueing means the fifth swipe is still being confirmed ten seconds later,
 * long after the user has moved on — the most recent action is the only one
 * still worth reporting.
 */
export function showToast(message: string): void {
  if (timer !== null) clearTimeout(timer);

  current = { id: nextId++, message };
  emit();

  timer = setTimeout(() => {
    timer = null;
    current = null;
    emit();
  }, VISIBLE_MS);
}

/** Dismiss whatever is showing. The user swiped or tapped it away. */
export function dismissToast(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  current = null;
  emit();
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToast(): Toast | null {
  return current;
}
