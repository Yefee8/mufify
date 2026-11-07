import { Disc3, ListPlus, MicVocal } from 'lucide-react-native';
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
  onGoToAlbum: (trackId: number) => void;
  onGoToArtist: (trackId: number) => void;
  onAddToPlaylist: (trackId: number) => void;
}

/**
 * The track's name and artist, and the things you can do to the track itself.
 *
 * The name opens the album and the artist opens the artist — the same two
 * places the library's shelves lead, reached from the one screen where the
 * question "what record is this?" actually comes up. Neither is underlined or
 * coloured: the title is the largest type in the app and dressing it as a link
 * would make Now Playing read as a web page. The player closing and the page
 * arriving is the feedback, and a screen reader speaks the hint.
 *
 * Add-to-playlist sits beside the heart because they are the same kind of
 * verb: keep this track somewhere. Lyrics stay first in the row, as before,
 * and only appear when the file has words.
 */
export function NowPlayingTitle({
  track,
  hasLyrics,
  showLyrics,
  onToggleLyrics,
  onGoToAlbum,
  onGoToArtist,
  onAddToPlaylist,
}: NowPlayingTitleProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  const album = track.albumName ?? t('common.unknownAlbum');
  const artist = track.artistName ?? t('common.unknownArtist');

  return (
    <View className="gap-2 px-6">
      <Pressable
        onPress={() => onGoToAlbum(track.id)}
        accessibilityRole="button"
        accessibilityLabel={track.title}
        accessibilityHint={t('player.goToAlbum', { album })}
        className="self-start"
      >
        <Text numberOfLines={2} className="font-display text-3xl text-primary">
          {track.title}
        </Text>
      </Pressable>

      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => onGoToArtist(track.id)}
          accessibilityRole="button"
          accessibilityLabel={artist}
          accessibilityHint={t('player.goToArtist', { artist })}
          // The row is as tall as the icon buttons beside it, so the name gets
          // the same 44-point target rather than one line of body text.
          className="min-h-11 flex-1 justify-center"
        >
          <Text numberOfLines={1} className="font-body text-base text-muted">
            {artist}
          </Text>
        </Pressable>

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

        <Pressable
          onPress={() => onAddToPlaylist(track.id)}
          accessibilityRole="button"
          accessibilityLabel={t('playlists.addTo')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <ListPlus color={colors.legend} size={22} strokeWidth={2} />
        </Pressable>

        <FavoriteButton trackId={track.id} />
      </View>
    </View>
  );
}
