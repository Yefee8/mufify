import type { EdgeInsets } from 'react-native-safe-area-context';

/** What a panel wants between its own contents and its edges. */
export interface PanelGap {
  bottom: number;
  /**
   * The panel's own horizontal padding, when it has any.
   *
   * It has to come through here rather than stay a `px-5` class: the system
   * inset and the panel's padding land on the same style key, and NativeWind
   * applies the `style` prop after the class, so a class would silently lose to
   * an inset of zero — which is every portrait phone. Adding them is the only
   * way both survive. The value is still a spacing token, handed in by the
   * caller.
   *
   * Omitted when the panel's rows carry their own padding, as in
   * `AddTracksSheet`, where the inset is all this needs to add.
   */
  side?: number;
}

/**
 * The padding a bottom-anchored panel needs to clear the system bars.
 *
 * Every sheet in the app stands off the navigation bar by hand, because the
 * surface runs to the window edge and only its contents stop short — see
 * `ActionSheet`. That was `insets.bottom` alone for as long as the app was
 * portrait-only, and the navigation bar is not at the bottom in landscape: on
 * a three-button device turned sideways it is a column down one side, and the
 * last action in a sheet goes straight back under it.
 *
 * All three edges from one place, so a sheet cannot remember one and forget
 * the others.
 */
export function panelInset(insets: EdgeInsets, gap: PanelGap) {
  const side = gap.side ?? 0;

  return {
    paddingBottom: insets.bottom + gap.bottom,
    paddingLeft: insets.left + side,
    paddingRight: insets.right + side,
  };
}
