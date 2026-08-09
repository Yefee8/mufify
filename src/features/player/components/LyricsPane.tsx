import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';

import { activeLineIndex, type Lyrics } from '@/services/lyrics/parseLyrics';
import { SPACING } from '@/theme/tokens';

import { useSmoothPosition } from '../hooks/useSmoothPosition';

export interface LyricsPaneProps {
  lyrics: Lyrics;
  /** Seek to a line's own timestamp. Timed lyrics only. */
  onSeek: (positionMs: number) => void;
}

/*
 * One style object rather than a class, for the same reason `CollectionGrid`
 * gives: mixing `contentContainerClassName` with a style leaves which padding
 * wins to NativeWind's merge order. The values are design-system tokens either
 * way.
 */
const PLAIN_CONTENT = {
  paddingHorizontal: SPACING[6],
  paddingVertical: SPACING[2],
  gap: SPACING[3],
} as const;

const TIMED_CONTENT = {
  paddingHorizontal: SPACING[6],
  paddingVertical: SPACING[2],
  gap: SPACING[4],
} as const;

/**
 * The words, in place of the artwork.
 *
 * Two shapes, decided by the file rather than by a setting: a timed lyric
 * follows the music and a plain one is a page to read. See
 * `services/lyrics/parseLyrics`.
 */
export function LyricsPane({ lyrics, onSeek }: LyricsPaneProps) {
  if (lyrics.kind === 'timed') return <TimedLyrics lyrics={lyrics} onSeek={onSeek} />;

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={PLAIN_CONTENT}
      showsVerticalScrollIndicator={false}
    >
      {lyrics.lines.map((line, index) => (
        // Lyrics repeat, so a line's position is what identifies it here.
        <Text key={`${index}-${line}`} className="font-body text-lg leading-7 text-primary">
          {line}
        </Text>
      ))}
    </ScrollView>
  );
}

interface TimedLyricsProps {
  lyrics: Extract<Lyrics, { kind: 'timed' }>;
  onSeek: (positionMs: number) => void;
}

/** How much of the pane sits above the line being sung. */
const ACTIVE_LINE_ANCHOR = 0.38;

/** How long a reader's own scroll suspends following. */
const MANUAL_SCROLL_GRACE_MS = 4000;

function TimedLyrics({ lyrics, onSeek }: TimedLyricsProps) {
  const { t } = useTranslation();
  const positionMs = useSmoothPosition(true);
  const active = activeLineIndex(lyrics.lines, positionMs);

  const scroller = useRef<ScrollView>(null);
  /** Where each line sits, filled in as they lay out. */
  const offsets = useRef<number[]>([]);
  const [paneHeight, setPaneHeight] = useState(0);

  /*
   * Following is suspended while the reader scrolls, and resumes a few seconds
   * after they let go. Yanking the view back on the next line is the single
   * worst thing a lyrics screen can do — it makes reading ahead impossible.
   */
  const [following, setFollowing] = useState(true);
  const resume = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onPaneLayout = useCallback((event: LayoutChangeEvent) => {
    setPaneHeight(event.nativeEvent.layout.height);
  }, []);

  const onLineLayout = useCallback((index: number, event: LayoutChangeEvent) => {
    offsets.current[index] = event.nativeEvent.layout.y;
  }, []);

  const onScrollBeginDrag = useCallback(() => {
    if (resume.current !== null) clearTimeout(resume.current);
    setFollowing(false);
  }, []);

  /** The grace period counts from letting go, not from first touching. */
  const onScrollEndDrag = useCallback(() => {
    if (resume.current !== null) clearTimeout(resume.current);
    resume.current = setTimeout(() => setFollowing(true), MANUAL_SCROLL_GRACE_MS);
  }, []);

  useEffect(
    () => () => {
      if (resume.current !== null) clearTimeout(resume.current);
    },
    [],
  );

  useEffect(() => {
    if (!following || active < 0 || paneHeight === 0) return;
    const y = offsets.current[active];
    if (y === undefined) return;

    scroller.current?.scrollTo({
      // The sung line sits above centre, so what is coming is on screen.
      y: Math.max(0, y - paneHeight * ACTIVE_LINE_ANCHOR),
      animated: true,
    });
  }, [active, following, paneHeight]);

  return (
    <ScrollView
      ref={scroller}
      onLayout={onPaneLayout}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      className="flex-1"
      contentContainerStyle={TIMED_CONTENT}
      showsVerticalScrollIndicator={false}
    >
      {lyrics.lines.map((line, index) => (
        <LyricLine
          key={`${index}-${line.atMs}`}
          index={index}
          line={line.text}
          atMs={line.atMs}
          active={index === active}
          onLayout={onLineLayout}
          onSeek={onSeek}
          label={t('player.lyrics.seekTo')}
        />
      ))}

      {/* Room to scroll the last line up to the anchor rather than stopping at
          the bottom of the list. */}
      <View style={{ height: paneHeight * (1 - ACTIVE_LINE_ANCHOR) }} />
    </ScrollView>
  );
}

interface LyricLineProps {
  index: number;
  line: string;
  atMs: number;
  active: boolean;
  onLayout: (index: number, event: LayoutChangeEvent) => void;
  onSeek: (positionMs: number) => void;
  label: string;
}

function LyricLine({ index, line, atMs, active, onLayout, onSeek, label }: LyricLineProps) {
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => onLayout(index, event),
    [index, onLayout],
  );
  const handlePress = useCallback(() => onSeek(atMs), [atMs, onSeek]);

  // A silent stretch is spacing, not a row to read or to press.
  if (line === '') return <View onLayout={handleLayout} className="h-2" />;

  return (
    <Pressable
      onLayout={handleLayout}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${line}`}
      accessibilityState={{ selected: active }}
    >
      <Text
        className={
          active
            ? 'font-body-medium text-xl leading-8 text-primary'
            : 'font-body text-xl leading-8 text-muted'
        }
      >
        {line}
      </Text>
    </Pressable>
  );
}
