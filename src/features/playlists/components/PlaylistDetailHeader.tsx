import { useRouter } from 'expo-router';
import { ChevronLeft, Pencil, Shuffle, Trash2 } from 'lucide-react-native';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

import { PlaylistMosaic } from './PlaylistMosaic';

export interface PlaylistDetailHeaderProps {
  name: string;
  trackCount: number;
  covers: readonly string[];
  onPlay: () => void;
  onShuffle: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

/**
 * A playlist's identity and everything you can do to the whole of it.
 *
 * Laid out the way a streaming app does — large artwork, name, then Play and
 * Shuffle side by side — because that is the arrangement everyone's hands already
 * know, and there is nothing to be gained by being different about it.
 *
 * Shuffle is a peer of Play rather than a toggle inside it. The app has five
 * shuffle algorithms and the one in Settings applies here too, so "shuffle this
 * playlist" is a real second way to start, not a modifier on the first.
 */
export function PlaylistDetailHeader({
  name,
  trackCount,
  covers,
  onPlay,
  onShuffle,
  onRename,
  onDelete,
}: PlaylistDetailHeaderProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const goBack = useCallback(() => router.back(), [router]);
  const empty = trackCount === 0;

  return (
    <View className="gap-4 pb-2">
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

        {onRename ? (
          <Pressable
            onPress={onRename}
            accessibilityRole="button"
            accessibilityLabel={t('playlists.rename')}
            className="min-h-11 min-w-11 items-center justify-center"
          >
            <Pencil color={colors.legend} size={20} strokeWidth={2} />
          </Pressable>
        ) : null}

        {onDelete ? (
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel={t('playlists.delete')}
            className="min-h-11 min-w-11 items-center justify-center"
          >
            <Trash2 color={colors.legend} size={20} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      <View className="flex-row items-end gap-4 px-6">
        <PlaylistMosaic covers={covers} size="lg" />

        <View className="flex-1 gap-1 pb-1">
          <Text numberOfLines={2} className="font-display text-2xl text-primary">
            {name}
          </Text>
          <Text className="font-mono text-sm text-muted">
            {t('playlists.trackCount', { count: trackCount })}
          </Text>
        </View>
      </View>

      {/* Hidden entirely when empty rather than disabled: an empty playlist's one
          job is to be filled, and two dead buttons above that message is noise. */}
      {empty ? null : (
        <View className="flex-row gap-3 px-6">
          <Pressable
            onPress={onPlay}
            accessibilityRole="button"
            accessibilityLabel={t('playlists.playAll')}
            className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-sm bg-accent px-4"
          >
            <Text className="font-body-medium text-base text-on-accent">
              {t('playlists.playAll')}
            </Text>
          </Pressable>

          <Pressable
            onPress={onShuffle}
            accessibilityRole="button"
            accessibilityLabel={t('playlists.shuffleAll')}
            className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-sm border border-subtle px-4"
          >
            <Shuffle color={colors.signal} size={18} strokeWidth={2} />
            <Text className="font-body-medium text-base text-accent">
              {t('playlists.shuffleAll')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
