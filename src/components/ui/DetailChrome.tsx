import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

import { PlayShuffleBar } from './PlayShuffleBar';
import { Skeleton } from './Skeleton';
import { useSplitMode } from './WindowSplit';

export interface DetailChromeProps {
  /** The top bar's right side: this screen's own actions, as icon buttons. */
  actions?: ReactNode;
  /**
   * The cover block's contents — an image, a mosaic, or a pressable around
   * one — rendered inside the square this lays out. Fill it (`h-full w-full`).
   */
  artwork: ReactNode;
  /** Null while the record is still being read: the text renders as bars. */
  name: string | null;
  subtitle?: string | null;
  /** The mono line under the name: "12 tracks". */
  meta: string;
  onPlay: () => void;
  onShuffle: () => void;
  /** Nothing to play. The pair is hidden rather than shown dead. */
  playDisabled?: boolean;
  /** An extra row under the buttons — the playlist screen's search box. */
  children?: ReactNode;
}

/**
 * The top of every detail screen: an album, an artist, a playlist.
 *
 * One component rather than a layout each screen re-creates, because the three
 * are the same screen to the person using them — a cover, a name, how much
 * there is, Play and Shuffle, then the tracks — and they had drifted into
 * three hand-built variants of it: two header components with near-identical
 * rows, and a second Play/Shuffle pair styled almost but not quite like
 * `PlayShuffleBar`. What a screen *does* stays its own: the actions in the top
 * bar, what the artwork is and whether it can be pressed, what follows below.
 *
 * Back is built in. Every detail screen is pushed, every one of them had the
 * identical chevron, and a screen that opted out would be a screen you cannot
 * leave.
 */
export function DetailChrome({
  actions,
  artwork,
  name,
  subtitle,
  meta,
  onPlay,
  onShuffle,
  playDisabled = false,
  children,
}: DetailChromeProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const goBack = useCallback(() => router.back(), [router]);

  /*
   * In a tablet's side column the cover goes on top, as wide as the column,
   * with the name under it. Beside the name it was a third of a phone-width
   * column — a stamp, with most of the column empty below it. On a phone, and
   * in a landscape phone's short column, it stays beside the name: there the
   * height is what is scarce.
   */
  const tall = useSplitMode() === 'wide';

  return (
    <View className="gap-4 pb-4">
      <View className="flex-row items-center gap-1 px-4 pt-6">
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <ChevronLeft color={colors.label} size={26} strokeWidth={2} />
        </Pressable>

        <View className="flex-1" />

        {actions}
      </View>

      <View className={tall ? 'gap-4 px-6' : 'flex-row items-end gap-4 px-6'}>
        <View className={tall ? 'aspect-square w-full' : 'aspect-square w-1/3'}>{artwork}</View>

        <View className={tall ? 'gap-1' : 'flex-1 gap-1 pb-1'}>
          {name === null ? (
            // The record is a frame behind the screen; bars, not a blank line.
            <>
              <Skeleton className="h-6 w-3/4 rounded-xs" />
              <Skeleton className="h-4 w-1/3 rounded-xs" />
            </>
          ) : (
            <>
              <Text numberOfLines={2} className="font-display text-2xl text-primary">
                {name}
              </Text>
              {subtitle ? (
                <Text numberOfLines={1} className="font-body text-sm text-muted">
                  {subtitle}
                </Text>
              ) : null}
              <Text className="font-mono text-sm text-muted">{meta}</Text>
            </>
          )}
        </View>
      </View>

      <PlayShuffleBar onPlay={onPlay} onShuffle={onShuffle} disabled={playDisabled} />

      {children}
    </View>
  );
}
