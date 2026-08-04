import { Modal } from 'react-native';

import { Sheet } from '@/components/ui/Sheet';

import { QueueScreen } from '../QueueScreen';
import { queueExpansion } from '../playerExpansion';

export interface QueueOverlayProps {
  /** Mounted. It carries a FlashList of the whole queue; closed, it costs nothing. */
  visible: boolean;
  /** On screen — opening, open, or still closing. Gates the window. */
  presented: boolean;
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
 *
 * And it is the one sheet that gets its own window. Everything above is about
 * where it sits in the app's view tree; on the Mi 9T (Android 10, MIUI) that
 * turned out not to decide what is drawn on top. The tab bar's icons and labels
 * composited in front of this surface while their own backgrounds stayed
 * correctly behind it, and so did a row of the library list underneath — leaf
 * views only, from a screen the sheet completely covers. Neither `zIndex` nor
 * elevation touched it, in either direction, and API 35 draws the same tree
 * correctly. A separate window is not a stacking claim the view system can get
 * wrong: the compositor keeps windows apart, so nothing in the app's window can
 * reach this one.
 */
export function QueueOverlay({ visible, presented, expanded, onClose }: QueueOverlayProps) {
  return (
    <Modal
      /*
        `presented`, not `visible`: the window has to exist for the whole travel
        and at no other time. `visible` is also set by `prepare`, on press-in,
        which is right for a view — off screen, taking no touches — and wrong
        for a window, because a press that never became a tap would leave a
        full-screen transparent one over the app swallowing everything. Measured
        on the emulator, not assumed.
      */
      visible={presented}
      /*
        Transparent and unanimated: `Sheet` owns both. The window is only here
        to put the surface out of reach of the one below it, and a scrim or a
        second animation would be the platform having opinions about a
        transition that was tuned by hand.
      */
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      /* Android back, which no longer reaches `PlayerLayer` from this window. */
      onRequestClose={onClose}
    >
      <Sheet
        progress={queueExpansion}
        visible={visible}
        expanded={expanded}
        className="absolute inset-0 z-40 bg-surface"
        /*
          No fade. This arrives over Now Playing, which is already opaque, so
          there is nothing to fade against — and not animating alpha keeps
          Android from promoting the surface to a hardware layer and releasing
          it again, which is the most likely reason the close chevron drew for a
          frame and then vanished on the phone.
        */
        fade={false}
      >
        <QueueScreen onClose={onClose} />
      </Sheet>
    </Modal>
  );
}
