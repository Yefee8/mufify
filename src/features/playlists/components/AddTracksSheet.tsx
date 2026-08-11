import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Check, Music, SearchX } from 'lucide-react-native';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/EmptyState';
import { addTracksToPlaylist } from '@/db/queries/playlists';
import { SearchField } from '@/features/library/components/SearchField';
import { useDebounced } from '@/features/library/hooks/useDebounced';
import { useTracks } from '@/features/library/hooks/useLibrary';
import type { TrackListItem } from '@/db/queries/tracks';
import { commitFeedback } from '@/services/haptics';
import { SPACING } from '@/theme/tokens';
import { useThemeColors } from '@/theme/useTheme';

export interface AddTracksSheetProps {
  visible: boolean;
  playlistId: number;
  /** Track ids already in this playlist, so the list can say so. */
  existing: ReadonlySet<number>;
  onClose: () => void;
}

/** Uniform rows, so FlashList can skip measurement. */
const ROW_HEIGHT = 64;

/** How much of the screen the sheet takes. Enough rows to pick from at once. */
const SHEET_HEIGHT_RATIO = 0.82;

/** Keeps a press on the panel from reaching the scrim behind it. */
function absorb(): boolean {
  return true;
}

/**
 * Pick tracks out of the library and put them in a playlist.
 *
 * The other direction already existed — long-press a track, choose a playlist —
 * and it is the wrong way round for filling a playlist you have just made: it
 * makes adding twenty tracks twenty trips through a menu. This is the way every
 * streaming app does it, and the reason is arithmetic.
 *
 * Multi-select with a running count, because the alternative is closing and
 * reopening the sheet once per track. Tracks already in the playlist are
 * marked rather than hidden: the same track is allowed to appear twice, and
 * silently dropping it from the list would look like a search that missed.
 */
export function AddTracksSheet({ visible, playlistId, existing, onClose }: AddTracksSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [search, setSearch] = useState('');
  // The field stays instant; only the query waits.
  const { tracks } = useTracks(useDebounced(search));
  const [selected, setSelected] = useState<readonly number[]>([]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = useCallback((trackId: number) => {
    setSelected((current) =>
      current.includes(trackId)
        ? current.filter((id) => id !== trackId)
        : // Appended, so the playlist gets them in the order they were picked.
          [...current, trackId],
    );
  }, []);

  const close = useCallback(() => {
    setSearch('');
    setSelected([]);
    onClose();
  }, [onClose]);

  const add = useCallback(() => {
    if (selected.length === 0) return;
    commitFeedback();
    void addTracksToPlaylist(playlistId, [...selected]);
    close();
  }, [close, playlistId, selected]);

  /* "Add 0 tracks" is not a sentence; with nothing picked the button asks. */
  const label =
    selected.length === 0
      ? t('playlists.addTracks.addNone')
      : t('playlists.addTracks.add', { count: selected.length });

  const renderItem = useCallback<ListRenderItem<TrackListItem>>(
    ({ item }) => (
      <PickableRow
        track={item}
        checked={selectedSet.has(item.id)}
        alreadyIn={existing.has(item.id)}
        onToggle={toggle}
        alreadyLabel={t('playlists.addTracks.alreadyIn')}
      />
    ),
    [existing, selectedSet, t, toggle],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      transparent
      onRequestClose={close}
    >
      {/* Scrim, the same one every sheet in the app uses. Tapping it dismisses. */}
      <Pressable
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel={t('common.cancel')}
        className="flex-1 justify-end bg-surface/80"
      >
        {/*
          A real height, not `max-h-full`.

          The panel is bottom-anchored, so without one it hugs its children —
          and the list inside asks its parent how tall it may be, is told
          nothing, and renders no rows at all. That is exactly what the first
          build of this sheet did: a title, a search box, a button, and a gap
          where the library should have been. `onStartShouldSetResponder`
          absorbs taps so pressing the panel does not close it.
        */}
        <View
          onStartShouldSetResponder={absorb}
          style={{ height: height * SHEET_HEIGHT_RATIO, paddingBottom: insets.bottom + SPACING[4] }}
          className="rounded-md border border-subtle bg-surface-elevated pt-5"
        >
          <View className="flex-row items-center gap-3 px-5 pb-3">
            <Text className="flex-1 font-body-medium text-base text-primary">
              {t('playlists.addTracks.title')}
            </Text>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
              className="min-h-11 justify-center px-2"
            >
              <Text className="font-body-medium text-sm text-muted">{t('common.cancel')}</Text>
            </Pressable>
          </View>

          <SearchField value={search} onChange={setSearch} />

          {/* Bounded, or the list inside a flex parent keeps its first height. */}
          <View className="min-h-0 flex-1">
            <FlashList
              data={tracks}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              overrideItemLayout={setRowHeight}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <EmptyState
                  icon={SearchX}
                  messages={[
                    search.trim()
                      ? t('library.noResults', { term: search })
                      : t('playlists.addTracks.empty'),
                  ]}
                />
              }
            />
          </View>

          <View className="px-5 pt-3">
            <Pressable
              onPress={add}
              disabled={selected.length === 0}
              accessibilityRole="button"
              accessibilityState={{ disabled: selected.length === 0 }}
              accessibilityLabel={label}
              className={
                selected.length === 0
                  ? 'min-h-11 items-center justify-center rounded-sm border border-subtle px-4'
                  : 'min-h-11 items-center justify-center rounded-sm bg-accent px-4'
              }
            >
              <Text
                className={
                  selected.length === 0
                    ? 'font-body-medium text-base text-muted'
                    : 'font-body-medium text-base text-on-accent'
                }
              >
                {label}
              </Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

function keyExtractor(track: TrackListItem): string {
  return String(track.id);
}

function setRowHeight(layout: { span?: number; size?: number }): void {
  layout.size = ROW_HEIGHT;
}

interface PickableRowProps {
  track: TrackListItem;
  checked: boolean;
  alreadyIn: boolean;
  onToggle: (trackId: number) => void;
  /** Already translated. */
  alreadyLabel: string;
}

/**
 * One library track, with a box.
 *
 * The whole row is the target rather than the box alone: a 24px checkbox is a
 * miss waiting to happen, and there is nothing else on the row to press.
 */
const PickableRow = memo(function PickableRow({
  track,
  checked,
  alreadyIn,
  onToggle,
  alreadyLabel,
}: PickableRowProps) {
  const colors = useThemeColors();
  const handlePress = useCallback(() => onToggle(track.id), [onToggle, track.id]);

  const artworkUri = track.artworkPath;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={track.title}
      android_ripple={{ color: colors.etch }}
      style={{ height: ROW_HEIGHT }}
      className="flex-row items-center gap-3 px-5"
    >
      <View
        className={
          checked
            ? 'h-6 w-6 items-center justify-center rounded-xs bg-accent'
            : 'h-6 w-6 items-center justify-center rounded-xs border border-subtle'
        }
      >
        {checked ? <Check color={colors.onSignal} size={16} strokeWidth={3} /> : null}
      </View>

      {artworkUri ? (
        <Image
          source={{ uri: `file://${artworkUri}` }}
          recyclingKey={String(track.id)}
          cachePolicy="memory-disk"
          contentFit="cover"
          className="h-10 w-10 rounded-xs"
        />
      ) : (
        <View className="h-10 w-10 items-center justify-center rounded-xs bg-surface">
          <Music color={colors.legend} size={18} strokeWidth={2} />
        </View>
      )}

      <View className="flex-1">
        <Text numberOfLines={1} className="font-body text-base text-primary">
          {track.title}
        </Text>
        <Text numberOfLines={1} className="font-body text-sm text-muted">
          {alreadyIn ? alreadyLabel : (track.artistName ?? '')}
        </Text>
      </View>
    </Pressable>
  );
});
