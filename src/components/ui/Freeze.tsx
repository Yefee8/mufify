import { Fragment, Suspense, type ReactNode } from 'react';

export interface FreezeProps {
  /** While true, the children keep their state but stop rendering. */
  freeze: boolean;
  children: ReactNode;
}

/** A promise that never settles, so the boundary stays on its fallback. */
const NEVER = { then: () => undefined };

/**
 * Keep a subtree mounted without paying for it.
 *
 * Frozen children are hidden and skip every render until thawed, but keep
 * their state, their native views and their subscriptions — so thawing costs
 * one render of whatever changed meanwhile instead of a whole mount. Suspense
 * does the work: a child that throws a promise that never settles holds the
 * boundary on its (empty) fallback, and React hides rather than unmounts
 * content that was already shown.
 *
 * The same technique `react-native-screens` uses to freeze inactive screens,
 * written out here rather than imported: it is these few lines, and the
 * package that provides them is only a transitive dependency of the router.
 */
export function Freeze({ freeze, children }: FreezeProps) {
  return (
    <Suspense fallback={null}>
      <Suspender freeze={freeze}>{children}</Suspender>
    </Suspense>
  );
}

function Suspender({ freeze, children }: FreezeProps) {
  if (freeze) {
    // Suspense's contract is a thrown thenable, not an Error.
    throw NEVER;
  }
  return <Fragment>{children}</Fragment>;
}
