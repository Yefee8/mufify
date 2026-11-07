import { Disc3, MicVocal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import type { PlayableTrack } from '@/services/audio/types';
import { useThemeColors } from '@/theme/useTheme';

import { FavoriteButton } from './FavoriteButton';

export interface NowPlayingTitleProps {
  track: PlayableTrack;
  /** The file carries words, so the lyrics toggle is offered. */
  hasLyrics: boolean;
  showLyrics: boolean;
  onToggleLyrics: () => void;
}

/**
 * The track's name and artist, and the things you can do to the track itself.
 * Split out of `PlayerScreen` at the 300-line limit.
 */
export function NowPlayingTitle({
  track,
  hasLyrics,
  showLyrics,
  onToggleLyrics,
}: NowPlayingTitleProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const artist = track.artistName ?? t('common.unknownArtist');

  return (
    <View className="gap-2 px-6">
      <Text numberOfLines={2} className="font-display text-3xl text-primary">
        {track.title}
      </Text>

      <View className="flex-row items-center justify-between">
        <Text numberOfLines={1} className="flex-1 font-body text-base text-muted">
          {artist}
        </Text>

        {/*
          Only when the file actually carries words. A button that opens an
          empty screen for most of a library is worse than no button — and this
          is the whole affordance, because the artwork underneath owns two pan
          gestures and a tap target on top of them is how a scrub turns into a
          dismiss.
        */}
        {hasLyrics ? (
          <Pressable
            onPress={onToggleLyrics}
            accessibilityRole="button"
            accessibilityLabel={
              showLyrics ? t('player.lyrics.showArtwork') : t('player.lyrics.show')
            }
            accessibilityState={{ selected: showLyrics }}
            className="min-h-11 min-w-11 items-center justify-center"
          >
            {showLyrics ? (
              <Disc3 color={colors.signal} size={22} strokeWidth={2} />
            ) : (
              <MicVocal color={colors.legend} size={22} strokeWidth={2} />
            )}
          </Pressable>
        ) : null}

        <FavoriteButton trackId={track.id} />
      </View>
    </View>
  );
}
