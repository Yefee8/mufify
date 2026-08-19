import { Image } from 'expo-image';
import { Check, Music } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  /** True when this is the track the engine is playing. Indigo marks it. */
  isCurrent?: boolean;
  /** The list is in selection mode, so a tick box replaces the duration. */
  isSelecting?: boolean;
  isSelected?: boolean;
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
  isCurrent = false,
  isSelecting = false,
  isSelected = false,
}: TrackRowProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const handlePress = useCallback(() => onPress(track.id), [onPress, track.id]);
  const handleLongPress = useCallback(() => onLongPress(track.id), [onLongPress, track.id]);

  // Artwork paths are stored bare, without a scheme, because that is what the
  // Kotlin side writes and what it hands back. expo-image needs the scheme.
  const artworkUri = track.artworkPath ? `file://${track.artworkPath}` : null;

  const subtitle = [
    track.artistName ?? t('common.unknownArtist'),
    track.albumName ?? t('common.unknownAlbum'),
  ].join(' — ');

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      android_ripple={{ color: colors.etch }}
      accessibilityLabel={track.title}
      accessibilityHint={subtitle || undefined}
      /* In selection mode the row *is* a checkbox, and saying so is what makes
         the tick readable to a screen reader at all. */
      accessibilityRole={isSelecting ? 'checkbox' : 'button'}
      accessibilityState={isSelecting ? { checked: isSelected } : { selected: isCurrent }}
      className="h-16 flex-row items-center gap-3 px-6"
    >
      {artworkUri ? (
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
            isCurrent
              ? 'font-body-medium text-base text-accent'
              : 'font-body text-base text-primary'
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

      {/* The tick takes the duration's place rather than adding a column: the
          row is already full, and a duration is not what anyone is reading
          while picking things out of a list. */}
      {isSelecting ? (
        <View
          className={
            isSelected
              ? 'h-6 w-6 items-center justify-center rounded-full bg-accent'
              : 'h-6 w-6 items-center justify-center rounded-full border border-subtle'
          }
        >
          {isSelected ? <Check color={colors.onSignal} size={14} strokeWidth={3} /> : null}
        </View>
      ) : (
        /* Mono for every technical value, so durations align down the column. */
        <Text className="font-mono text-sm text-muted">
          {formatDuration(track.durationMs, locale)}
        </Text>
      )}
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
    previous.isCurrent === next.isCurrent &&
    previous.isSelecting === next.isSelecting &&
    previous.isSelected === next.isSelected &&
    previous.track.id === next.track.id &&
    previous.track.title === next.track.title &&
    previous.track.artistName === next.track.artistName &&
    previous.track.albumName === next.track.albumName &&
    previous.track.durationMs === next.track.durationMs &&
    previous.track.artworkPath === next.track.artworkPath
  );
}

export const TrackRow = memo(TrackRowComponent, isSameRow);
