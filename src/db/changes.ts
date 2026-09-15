/**
 * "Something the user made just changed."
 *
 * Playlists and hearts are edited from a dozen screens through a handful of
 * query functions, and one thing outside the database wants to know when any
 * of them ran: the backup that keeps a copy of them outside the app. The
 * queries cannot import it — it imports them — so they announce here, to a
 * module with no dependencies, and the backup listens.
 *
 * Deliberately not for listens. Those go through `recordListen`, whose caller
 * already knows a write happened and asks for the copy itself.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function onUserDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyUserDataChanged(): void {
  for (const listener of listeners) listener();
}
