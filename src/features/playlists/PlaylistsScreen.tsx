import { useRouter } from 'expo-router';
import { HeartOff, ListMusic, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { NameDialog } from '@/components/ui/NameDialog';
import { LikedFilter } from '@/components/ui/LikedFilter';
import { Screen } from '@/components/ui/Screen';
import {
  createPlaylist,
  useFavoriteEntries,
  usePlaylists,
  type PlaylistSummary,
} from '@/db/queries/playlists';
import { useMiniPlayerInset } from '@/features/player/playerLayerLayout';
import { useMessages } from '@/i18n';
import { SPACING } from '@/theme/tokens';
import { useThemeColors } from '@/theme/useTheme';
import { useLifecycleTrace } from '@/services/perf/useLifecycleTrace';

import { PlaylistRow } from './components/PlaylistRow';
import { buildPlaylistRows, shouldShowEmptyState } from './playlistRows';

/**
 * The user's playlists.
 *
 * `FlatList` rather than FlashList on purpose: `AGENTS.md` mandates FlashList
 * for *track* lists, which run to ten thousand rows. Nobody has ten thousand
 * playlists, and FlashList's recycling costs more than it saves at this size.
 */
export function PlaylistsScreen() {
  useLifecycleTrace('PlaylistsScreen');
  const { t } = useTranslation();
  const messages = useMessages('playlists.empty');
  const bottomInset = useMiniPlayerInset();
  const colors = useThemeColors();
  const router = useRouter();

  const playlists = usePlaylists();
  const likedEntries = useFavoriteEntries();
  const [naming, setNaming] = useState(false);
  const [likedOnly, setLikedOnly] = useState(false);

  const openNaming = useCallback(() => setNaming(true), []);
  const closeNaming = useCallback(() => setNaming(false), []);

  const onCreate = useCallback(
    async (name: string) => {
      setNaming(false);
      const id = await createPlaylist(name);
      // Straight into the new playlist: it is empty, and the next thing the
      // user wants is to put something in it.
      if (id !== null) router.push(`/playlist/${id}`);
    },
    [router],
  );

  const openPlaylist = useCallback((id: number) => router.push(`/playlist/${id}`), [router]);

  const renderItem = useCallback(
    ({ item }: { item: PlaylistSummary }) => <PlaylistRow playlist={item} onPress={openPlaylist} />,
    [openPlaylist],
  );

  const rows = buildPlaylistRows(likedEntries, playlists, t('playlists.likedSongs'), likedOnly);

  return (
    <Screen title={t('playlists.title')}>
      <View className="flex-row items-center gap-3 px-6 pb-4">
        {/* `rows.length`, so the number describes the list under it. */}
        <Text className="flex-1 font-mono text-sm text-muted">
          {t('playlists.count', { count: rows.length })}
        </Text>

        <LikedFilter
          active={likedOnly}
          onChange={setLikedOnly}
          accessibilityLabel={t('playlists.likedFilter')}
        />

        <Pressable
          onPress={openNaming}
          accessibilityRole="button"
          accessibilityLabel={t('playlists.create')}
          className="min-h-11 flex-row items-center gap-2 rounded-sm border border-subtle px-4"
        >
          <Plus color={colors.signal} size={18} strokeWidth={2} />
          <Text className="font-body-medium text-sm text-accent">{t('playlists.create')}</Text>
        </Pressable>
      </View>

      <FlatList
        data={rows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingBottom: SPACING[8] + bottomInset }}
        ListFooterComponent={
          shouldShowEmptyState(rows) ? (
            likedOnly ? (
              /* Nothing liked is not "no playlists": offering Create here would
                 answer a question the filter did not ask. The heart stays on
                 screen above, which is the way back. */
              <EmptyState icon={HeartOff} messages={[t('playlists.noLiked')]} />
            ) : (
              <EmptyState
                icon={ListMusic}
                messages={messages}
                actionLabel={t('playlists.create')}
                onAction={openNaming}
              />
            )
          ) : null
        }
      />

      <NameDialog
        visible={naming}
        title={t('playlists.create')}
        onCancel={closeNaming}
        onSubmit={onCreate}
      />
    </Screen>
  );
}

function keyExtractor(playlist: PlaylistSummary): string {
  return String(playlist.id);
}
