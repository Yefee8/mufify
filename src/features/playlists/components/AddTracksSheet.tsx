import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Check } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';

import type { TrackListItem } from '@/db/queries/tracks';
import { commitFeedback, tapFeedback } from '@/services/haptics';
import { useThemeColors } from '@/theme/useTheme';

import { SearchField } from '../../library/components/SearchField';
import { useDebounced } from '../../library/hooks/useDebounced';
import { useTracks } from '../../library/hooks/useLibrary';

export interface AddTracksSheetProps {
  visible: boolean;
  /** Called with the picked ids, in the order they were ticked. */
  onAdd: (trackIds: number[]) => void;
  onClose: () => void;
}

/**
 * Pick tracks from the library to add to a playlist.
 *
 * This is the missing direction. Adding a track to a playlist could only be done
 * *from* the library, which means filling a playlist meant knowing every track
 * you wanted before you started — the playlist itself, the screen where you can
 * see what is already in it, had no way to add anything.
 *
 * Searchable, because picking from a 10,000-track library by scrolling is not
 * picking. Multi-select, because nobody adds one track at a time.
 *
 * Mounted only while open (`visible` guards the whole subtree) rather than
 * hidden behind a Modal's own visibility. It runs the full library query, and
 * keeping that live on the playlist screen forever would put a second copy of the
 * most expensive query in the app behind a sheet nobody has opened.
 */
export function AddTracksSheet({ visible, onAdd, onClose }: AddTracksSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {visible ? <Picker onAdd={onAdd} onClose={onClose} /> : null}
    </Modal>
  );
}

interface PickerProps {
  onAdd: (trackIds: number[]) => void;
  onClose: () => void;
}

function Picker({ onAdd, onClose }: PickerProps) {
  const { t } = useTranslation();

  const [search, setSearch] = useState('');
  const { tracks } = useTracks(useDebounced(search));
  const [picked, setPicked] = useState<number[]>([]);

  const toggle = useCallback((id: number) => {
    tapFeedback();
    setPicked((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }, []);

  const confirm = useCallback(() => {
    if (picked.length === 0) return;
    commitFeedback();
    onAdd(picked);
  }, [picked, onAdd]);

  const renderItem = useCallback<ListRenderItem<TrackListItem>>(
    ({ item }) => (
      <PickRow track={item} isPicked={picked.includes(item.id)} onToggle={toggle} />
    ),
    [picked, toggle],
  );

  return (
    <View className="flex-1 justify-end bg-surface/80">
      <View className="h-3/4 gap-3 rounded-md border border-subtle bg-surface-elevated pt-5">
        <View className="flex-row items-center gap-3 px-5">
          <Text className="flex-1 font-body-semibold text-base text-primary">
            {t('playlists.addTracks')}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            className="min-h-11 items-center justify-center px-2"
          >
            <Text className="font-body text-base text-muted">{t('common.cancel')}</Text>
          </Pressable>
        </View>

        <SearchField value={search} onChange={setSearch} />

        {/* Bounded, so the virtualized list inside gets a real height. */}
        <View className="flex-1">
          <FlashList data={tracks} renderItem={renderItem} keyExtractor={keyExtractor} />
        </View>

        <Pressable
          onPress={confirm}
          disabled={picked.length === 0}
          accessibilityRole="button"
          accessibilityLabel={t('playlists.addSelected', { count: picked.length })}
          accessibilityState={{ disabled: picked.length === 0 }}
          className={
            picked.length === 0
              ? 'min-h-11 items-center justify-center border-t border-subtle py-4'
              : 'min-h-11 items-center justify-center border-t border-subtle bg-accent py-4'
          }
        >
          <Text
            className={
              picked.length === 0
                ? 'font-body text-base text-muted'
                : 'font-body-medium text-base text-on-accent'
            }
          >
            {t('playlists.addSelected', { count: picked.length })}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

interface PickRowProps {
  track: TrackListItem;
  isPicked: boolean;
  onToggle: (id: number) => void;
}

/** A library track with a tick box. Deliberately plainer than `TrackRow`. */
function PickRow({ track, isPicked, onToggle }: PickRowProps) {
  const colors = useThemeColors();
  const subtitle = [track.artistName, track.albumName].filter(Boolean).join(' — ');

  return (
    <Pressable
      onPress={() => onToggle(track.id)}
      accessibilityRole="checkbox"
      accessibilityLabel={track.title}
      accessibilityHint={subtitle || undefined}
      accessibilityState={{ checked: isPicked }}
      className="h-16 flex-row items-center gap-3 px-5"
    >
      <View
        className={
          isPicked
            ? 'h-8 w-8 items-center justify-center rounded-xs bg-accent'
            : 'h-8 w-8 items-center justify-center rounded-xs border border-subtle'
        }
      >
        {isPicked ? <Check color={colors.onSignal} size={16} strokeWidth={3} /> : null}
      </View>

      <View className="flex-1">
        <Text numberOfLines={1} className="font-body text-base text-primary">
          {track.title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="font-body text-sm text-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function keyExtractor(track: TrackListItem): string {
  return String(track.id);
}
