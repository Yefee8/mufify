import { ListMusic, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text } from 'react-native';

import { addTracksToPlaylist, createPlaylist, usePlaylists } from '@/db/queries/playlists';
import { commitFeedback } from '@/services/haptics';
import { useThemeColors } from '@/theme/useTheme';

import { NamePlaylistDialog } from './NamePlaylistDialog';

export interface AddToPlaylistSheetProps {
  /**
   * The tracks to add. Empty means closed.
   *
   * A list rather than one id, because multi-select adds a whole selection at
   * once and the single-track case is just a list of one. Order is preserved:
   * they land in the playlist in the order they were picked.
   */
  trackIds: readonly number[];
  onClose: () => void;
}

/**
 * Pick a playlist for some tracks, or make one.
 *
 * Creating from here adds them immediately rather than dropping the user into an
 * empty playlist — they said what they wanted before they were asked where to
 * put it.
 */
export function AddToPlaylistSheet({ trackIds, onClose }: AddToPlaylistSheetProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const playlists = usePlaylists();
  const [naming, setNaming] = useState(false);

  const addTo = useCallback(
    (playlistId: number) => {
      if (trackIds.length === 0) return;
      commitFeedback();
      void addTracksToPlaylist(playlistId, [...trackIds]);
      onClose();
    },
    [trackIds, onClose],
  );

  const onCreate = useCallback(
    async (name: string) => {
      setNaming(false);
      if (trackIds.length === 0) return;
      const id = await createPlaylist(name);
      if (id !== null) await addTracksToPlaylist(id, [...trackIds]);
      commitFeedback();
      onClose();
    },
    [trackIds, onClose],
  );

  return (
    <Modal
      visible={trackIds.length > 0}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        className="flex-1 justify-end bg-surface/80"
      >
        <Pressable
          onPress={absorb}
          className="max-h-full gap-4 rounded-md border border-subtle bg-surface-elevated p-5"
        >
          <Text className="font-body-semibold text-base text-primary">
            {trackIds.length > 1
              ? t('playlists.addCount', { count: trackIds.length })
              : t('playlists.addTo')}
          </Text>

          <Pressable
            onPress={() => setNaming(true)}
            accessibilityRole="button"
            className="min-h-11 flex-row items-center gap-3"
          >
            <Plus color={colors.signal} size={20} strokeWidth={2} />
            <Text className="font-body-medium text-base text-accent">
              {t('playlists.create')}
            </Text>
          </Pressable>

          <ScrollView>
            {playlists.map((playlist) => (
              <Pressable
                key={playlist.id}
                onPress={() => addTo(playlist.id)}
                accessibilityRole="button"
                accessibilityLabel={playlist.name}
                className="min-h-11 flex-row items-center gap-3"
              >
                <ListMusic color={colors.legend} size={20} strokeWidth={2} />
                <Text numberOfLines={1} className="flex-1 font-body text-base text-primary">
                  {playlist.name}
                </Text>
                <Text className="font-mono text-sm text-muted">{playlist.trackCount}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>

      <NamePlaylistDialog
        visible={naming}
        title={t('playlists.create')}
        onCancel={() => setNaming(false)}
        onSubmit={onCreate}
      />
    </Modal>
  );
}

function absorb(): void {
  // Stops a tap inside the sheet from reaching the dismissing scrim.
}
