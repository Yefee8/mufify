import { createContext, useContext, type ReactNode } from 'react';
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

/**
 * From here up the window is a tablet (or a desktop window): wide enough that
 * a phone-width column of controls and a list can sit side by side with room
 * to spare, whatever the height. A portrait 10" tablet is about 800 points
 * across.
 */
const TWO_PAGES_WIDE = 720;

/** The controls column on a tablet: a phone's width, give or take. */
const ASIDE_MIN = 320;
const ASIDE_MAX = 440;

/**
 * How the window is being used: one column, or the aside of a short or a wide
 * window. Read by what sits in the aside — a detail screen's header lays its
 * cover out differently in a column a phone's width tall than across the top.
 */
export type SplitMode = 'stacked' | 'short' | 'wide';

const SplitModeContext = createContext<SplitMode>('stacked');

/** Which layout the nearest `WindowSplit` chose, for what renders inside it. */
export function useSplitMode(): SplitMode {
  return useContext(SplitModeContext);
}

export interface WindowSplitProps {
  /** The screen's controls: counts, filters, search, the actions, banners. */
  aside: ReactNode;
  /** The list, which takes the full height when the window has none to spare. */
  children: ReactNode;
  /** Height of the transport strip, so the last control is not behind it. */
  bottomInset?: number;
}

/**
 * Header above list, or header beside list when the window has the room.
 *
 * Two windows want the columns, for two different reasons. A **short** window
 * — a landscape phone, a phone in split-screen — stacks a 300-to-500-point
 * header over a list with nowhere left to be; sideways, the same pieces become
 * a scrollable column next to a list that gets the whole height. A **wide**
 * window — a tablet — has the opposite problem: stacked, the header scales up
 * with the width until an album cover is the size of a hand and the tracks it
 * belongs to are a strip underneath. There the controls keep a phone's width,
 * on the left, and the list takes everything else.
 *
 * On a phone held upright this renders its children exactly as they were, so
 * the layout the app was designed in is untouched. The test is always the
 * window, not the device or the orientation — split-screen makes a tablet
 * window phone-shaped, and then it gets the phone layout, which is the right
 * one for the space.
 */
export function WindowSplit({ aside, children, bottomInset = 0 }: WindowSplitProps) {
  const { width, height } = useWindowDimensions();

  const short = height < SHORT_HEIGHT && width >= WIDE_ENOUGH;
  const wide = width >= TWO_PAGES_WIDE;

  if (!short && !wide) {
    return (
      <>
        {aside}
        {children}
      </>
    );
  }

  const mode: SplitMode = wide ? 'wide' : 'short';

  /*
   * Short windows: two parts controls to three parts list, as flex ratios
   * rather than widths. A `w-2/5` on the `ScrollView` did not hold — the
   * percentage landed on the scrolling content rather than on the view around
   * it, and the column then took whatever width its own content wanted.
   * Growing from a zero basis cannot do that: the ratio is between the two
   * columns and nothing inside them can argue with it.
   *
   * Wide windows: the controls were drawn for a phone, so they get a phone's
   * width and stop growing — a ratio here would hand a 1280-point window a
   * 500-point cover again, which is the tablet complaint this exists to fix.
   */
  const asideStyle = wide
    ? { width: Math.min(ASIDE_MAX, Math.max(ASIDE_MIN, width * 0.36)) }
    : ASIDE;

  return (
    <View className="flex-1 flex-row">
      <View style={asideStyle}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: bottomInset }}
          keyboardShouldPersistTaps="handled"
        >
          <SplitModeContext.Provider value={mode}>{aside}</SplitModeContext.Provider>
        </ScrollView>
      </View>

      <View style={MAIN}>{children}</View>
    </View>
  );
}

const ASIDE = { flexBasis: 0, flexGrow: 2, flexShrink: 1 } as const;
const MAIN = { flexBasis: 0, flexGrow: 3, flexShrink: 1 } as const;
