import { Image } from 'expo-image';
import { Music, Volume2, X } from 'lucide-react-native';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { PlayableTrack } from '@/services/audio/types';
import { formatDuration } from '@/services/format/duration';
import { useThemeColors } from '@/theme/useTheme';

export interface QueueRowProps {
  track: PlayableTrack;
  position: number;
  isCurrent: boolean;
  /** Already played in this queue. Dimmed rather than removed. */
  isPast: boolean;
  locale: string;
  onPress: (position: number) => void;
  onRemove: (position: number) => void;
}

/**
 * One entry in the queue.
 *
 * Played entries stay, dimmed. Removing them would make the list jump under
 * the finger every time a track ends, and "what did I just hear" is a question
 * people ask a queue.
 */
export const QueueRow = memo(function QueueRow({
  track,
  position,
  isCurrent,
  isPast,
  locale,
  onPress,
  onRemove,
}: QueueRowProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const handlePress = useCallback(() => onPress(position), [onPress, position]);
  const handleRemove = useCallback(() => onRemove(position), [onRemove, position]);

  const artworkUri = track.artworkPath ? `file://${track.artworkPath}` : null;
  const subtitle = [
    track.artistName ?? t('common.unknownArtist'),
    track.albumName ?? t('common.unknownAlbum'),
  ].join(' — ');

  return (
    /*
     * A played entry is dimmed and nothing else.
     *
     * One opacity on the row, rather than a different colour on the title and a
     * separate opacity on the artwork: those two dimmed by different amounts,
     * which read as a shadow across the row instead of as "already played", and
     * left the artwork placeholder — a filled panel with no opacity of its own —
     * at full strength in the middle of it.
     */
    <View
      className={
        isCurrent
          ? 'h-16 flex-row items-center gap-3 border-l-2 border-accent bg-surface-elevated pl-5 pr-2'
          : isPast
            ? 'h-16 flex-row items-center gap-3 pl-6 pr-2 opacity-40'
            : 'h-16 flex-row items-center gap-3 pl-6 pr-2'
      }
    >
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={track.title}
        accessibilityState={{ selected: isCurrent }}
        className="h-16 flex-1 flex-row items-center gap-3"
      >
        {artworkUri ? (
          <Image
            source={{ uri: artworkUri }}
            recyclingKey={`${track.id}-${position}`}
            cachePolicy="memory-disk"
            contentFit="cover"
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

        {isCurrent ? (
          <Volume2 color={colors.signal} size={16} strokeWidth={2} />
        ) : (
          <Text className="font-mono text-sm text-muted">
            {formatDuration(track.durationMs, locale)}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={handleRemove}
        accessibilityRole="button"
        accessibilityLabel={t('queue.remove', { title: track.title })}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <X color={colors.legend} size={18} strokeWidth={2} />
      </Pressable>
    </View>
  );
});
