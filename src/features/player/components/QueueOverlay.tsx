import { Sheet } from '@/components/ui/Sheet';

import { QueueScreen } from '../QueueScreen';
import { queueExpansion } from '../playerExpansion';

export interface QueueOverlayProps {
  /** Mounted. It carries a FlashList of the whole queue; closed, it costs nothing. */
  visible: boolean;
  /** Settled open. */
  expanded: boolean;
  onClose: () => void;
}

/**
 * The queue, as a root-level sheet rather than a route.
 *
 * It used to be `app/queue.tsx`, pushed with `router.navigate('/queue')`, and
 * it opened without ever becoming visible: `PlayerLayer` mounts Now Playing
 * outside the router, and an opaque full-screen surface at that level covers
 * anything the navigator puts underneath it. Full reasoning in
 * `docs/adr/014`.
 *
 * It then had a second, quieter problem. Moving it to the root fixed *whether*
 * it appeared and left *how* alone — Reanimated's `SlideInDown` on the way in,
 * `SlideOutDown` on the way out — while Now Playing kept the hand-tuned spring
 * beside it. A spring in and a plain timing out, no mass term so not the
 * damping ratio that was tuned, no velocity handoff and no fade: the queue read
 * badly next to a player that read well, and the difference was never taste.
 *
 * Both go through `Sheet` now, against their own progress values.
 */
export function QueueOverlay({ visible, expanded, onClose }: QueueOverlayProps) {
  return (
    <Sheet
      progress={queueExpansion}
      visible={visible}
      expanded={expanded}
      className="absolute inset-0 z-40 bg-surface"
    >
      <QueueScreen onClose={onClose} />
    </Sheet>
  );
}
