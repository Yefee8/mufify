import type { ReactNode } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';

/**
 * Under this many points of height the window is a landscape phone rather than
 * a page: every screen in this app stacks a header on a list, and the headers
 * are between 300 and 500 points tall.
 */
const SHORT_HEIGHT = 520;

/**
 * And there has to be width worth spending before spending it. A phone in
 * split-screen is short *and* narrow; two columns there would be two bad
 * columns.
 */
const WIDE_ENOUGH = 600;

export interface ShortWindowSplitProps {
  /** The screen's controls: counts, filters, search, the actions, banners. */
  aside: ReactNode;
  /** The list, which takes the full height when the window has none to spare. */
  children: ReactNode;
  /** Height of the transport strip, so the last control is not behind it. */
  bottomInset?: number;
}

/**
 * Header above list, or header beside list when the window is short.
 *
 * Turning the phone sideways used to leave the library with about thirty points
 * of list: title, count, scan buttons, the view switch, the search box and the
 * play bar add up to more than a landscape phone is tall, and they were all
 * pinned above a list that then had nowhere to be. Nothing was broken — every
 * control worked — and the screen was useless, which is the part Play's
 * large-screen check is actually about.
 *
 * Sideways the same pieces become a column of their own, scrollable, next to a
 * list that gets the whole height. Upright this renders its children exactly as
 * they were, so the layout the app was designed in is untouched — the test is
 * the window, not the orientation, because a phone in split-screen is short for
 * the same reason and wants the same thing.
 *
 * It is deliberately not a tablet layout. A tablet is not short, so it stacks
 * like a phone and gets more grid columns instead; see
 * `docs/adr/029-no-orientation-lock.md`.
 */
export function ShortWindowSplit({ aside, children, bottomInset = 0 }: ShortWindowSplitProps) {
  const { width, height } = useWindowDimensions();

  if (height >= SHORT_HEIGHT || width < WIDE_ENOUGH) {
    return (
      <>
        {aside}
        {children}
      </>
    );
  }

  return (
    <View className="flex-1 flex-row">
      {/*
        Two parts controls to three parts list, as flex ratios rather than
        widths. A `w-2/5` on the `ScrollView` did not hold — the percentage
        landed on the scrolling content rather than on the view around it, and
        the column then took whatever width its own content wanted, which was
        most of the screen and left the list a strip too narrow to read a track
        title in. Growing from a zero basis cannot do that: the ratio is
        between the two columns and nothing inside them can argue with it.

        Two fifths because the controls were drawn for a phone's width and
        narrower starts wrapping the buttons, while three fifths of a landscape
        phone is still wider than an upright one.
      */}
      <View style={ASIDE}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: bottomInset }}
          keyboardShouldPersistTaps="handled"
        >
          {aside}
        </ScrollView>
      </View>

      <View style={MAIN}>{children}</View>
    </View>
  );
}

const ASIDE = { flexBasis: 0, flexGrow: 2, flexShrink: 1 } as const;
const MAIN = { flexBasis: 0, flexGrow: 3, flexShrink: 1 } as const;
