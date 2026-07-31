import { Image } from 'expo-image';
import { Check, Music } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { TrackListItem } from '@/db/queries/tracks';
import { formatDuration } from '@/services/format/duration';
import { useThemeColors } from '@/theme/useTheme';

export interface TrackRowProps {
  track: TrackListItem;
  /** Locale tag for the duration. Passed down so the row does no i18n lookup. */
  locale: string;
  /** Stable across renders — an inline arrow here would defeat the memo. */
  onPress: (id: number) => void;
  /** Long press opens the track's actions. Also stable. */
  onLongPress: (id: number) => void;
  /** True while the list is in selection mode. Swaps artwork for a checkbox. */
  isSelecting?: boolean;
  isSelected?: boolean;
  /** True when this is the track the engine is playing. Indigo marks it. */
  isCurrent?: boolean;
}

/**
 * One track: artwork, title, artist — album, duration.
 *
 * Memoized, and it has to stay that way. A 10,000-row list re-rendering every
 * visible row on each parent render is the difference between a list that
 * scrolls and one that does not.
 */
const TrackRowComponent = function TrackRow({
  track,
  locale,
  onPress,
  onLongPress,
  isSelecting = false,
  isSelected = false,
  isCurrent = false,
}: TrackRowProps) {
  const colors = useThemeColors();
  const handlePress = useCallback(() => onPress(track.id), [onPress, track.id]);
  const handleLongPress = useCallback(() => onLongPress(track.id), [onLongPress, track.id]);

  // Artwork paths are stored bare, without a scheme, because that is what the
  // Kotlin side writes and what it hands back. expo-image needs the scheme.
  const artworkUri = track.artworkPath ? `file://${track.artworkPath}` : null;

  const subtitle = [track.artistName, track.albumName].filter(Boolean).join(' — ');

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityRole={isSelecting ? 'checkbox' : 'button'}
      accessibilityLabel={track.title}
      accessibilityHint={subtitle || undefined}
      accessibilityState={isSelecting ? { checked: isSelected } : { selected: isCurrent }}
      className="h-16 flex-row items-center gap-3 px-6"
    >
      {/*
        The checkbox replaces the artwork rather than sitting beside it. Adding a
        column would shift every title sideways the moment selection starts,
        which makes the whole list appear to jump.
      */}
      {isSelecting ? (
        <View
          className={
            isSelected
              ? 'h-10 w-10 items-center justify-center rounded-xs bg-accent'
              : 'h-10 w-10 items-center justify-center rounded-xs border border-subtle'
          }
        >
          {isSelected ? <Check color={colors.onSignal} size={20} strokeWidth={3} /> : null}
        </View>
      ) : artworkUri ? (
        <Image
          source={{ uri: artworkUri }}
          // Recycling key and cache policy are both required by AGENTS.md: the
          // key stops a recycled row showing the previous track's cover for a
          // frame, and the artwork is already on disk so memory-only caching
          // would re-decode it on every pass.
          recyclingKey={String(track.id)}
          cachePolicy="memory-disk"
          contentFit="cover"
          // Drawn immediately from cache rather than fading in. The transition
          // is why rows appeared to arrive one at a time during a fast scroll:
          // a recycled row starts transparent and animates up, so flinging
          // through a long list left a trail of blank artwork behind the finger.
          transition={0}
          className="h-10 w-10 rounded-xs"
        />
      ) : (
        <View className="h-10 w-10 items-center justify-center rounded-xs bg-surface-elevated">
          <Music color={colors.legend} size={18} strokeWidth={2} />
        </View>
      )}

      <View className="flex-1">
        <Text
          numberOfLines={1}
          className={
            isCurrent ? 'font-body-medium text-base text-accent' : 'font-body text-base text-primary'
          }
        >
          {track.title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="font-body text-sm text-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Mono for every technical value, so durations align down the column. */}
      <Text className="font-mono text-sm text-muted">
        {formatDuration(track.durationMs, locale)}
      </Text>
    </Pressable>
  );
};

/**
 * Compared by value, not by reference.
 *
 * A live query hands back fresh objects every time it re-runs, so the default
 * reference check fails for every visible row on every scan batch even though
 * nothing the row draws has changed. Comparing the fields it actually renders
 * keeps those re-renders at zero.
 */
function isSameRow(previous: TrackRowProps, next: TrackRowProps): boolean {
  return (
    previous.locale === next.locale &&
    previous.onPress === next.onPress &&
    previous.onLongPress === next.onLongPress &&
    previous.isSelecting === next.isSelecting &&
    previous.isSelected === next.isSelected &&
    previous.isCurrent === next.isCurrent &&
    previous.track.id === next.track.id &&
    previous.track.title === next.track.title &&
    previous.track.artistName === next.track.artistName &&
    previous.track.albumName === next.track.albumName &&
    previous.track.durationMs === next.track.durationMs &&
    previous.track.artworkPath === next.track.artworkPath
  );
}

export const TrackRow = memo(TrackRowComponent, isSameRow);
