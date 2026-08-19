import { Disc3, HeartOff, User } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { LikedFilter } from '@/components/ui/LikedFilter';
import { SkeletonCards } from '@/components/ui/Skeleton';
import {
  listCollectionTracks,
  setAlbumFavorite,
  useFavoriteAlbumIds,
  type CollectionCard,
} from '@/db/queries/tracks';
import { onlyFavorites, withAlbumFavorites } from '@/services/library/albumFavorites';

import { CollectionActionSheet, type CollectionAction } from './components/CollectionActionSheet';
import { CollectionGrid } from './components/CollectionGrid';
import { useDeleteTracks } from './hooks/useDeleteTracks';
import { useTrackActions } from './hooks/useTrackActions';

export interface LibraryCollectionsProps {
  kind: 'artist' | 'album';
  cards: readonly CollectionCard[];
  /** Skeleton instead of a grid while true. */
  isLoading: boolean;
  onOpen: (id: number) => void;
}

/**
 * The artist and album shelves, and what you can do to a whole one.
 *
 * Split out of `LibraryScreen` for the same reason `LibraryTracks` was: the
 * screen owns the *library* — scanning, searching, which view is showing — and
 * each view owns the things in it. Adding whole-collection actions took the
 * screen past the 300-line limit `AGENTS.md` sets, and the boundary it forced
 * is the one that was already there in the tracks view.
 */
export function LibraryCollections({ kind, cards, isLoading, onOpen }: LibraryCollectionsProps) {
  const { t } = useTranslation();
  const { addToQueue, playNext } = useTrackActions();
  const deletion = useDeleteTracks();
  const [likedOnly, setLikedOnly] = useState(false);

  /*
   * Liked albums come from their own live query and are folded in here.
   * `useAlbumCards` is built `from(tracks)` — it has to be, to give tracks with
   * no album a card — and `useLiveQuery` watches only the table in `FROM`, so a
   * flag joined into it would never notice a heart being tapped.
   */
  const favorites = useFavoriteAlbumIds();
  const listed = useMemo(() => {
    if (kind === 'artist') return [...cards];
    const marked = withAlbumFavorites(cards, favorites);
    return likedOnly ? onlyFavorites(marked) : marked;
  }, [cards, favorites, kind, likedOnly]);

  /*
   * Held as the card rather than as an id. The sheet shows a name and a count,
   * and re-deriving those from the grid would let its contents change under it
   * while it is open — a rescan finishing mid-press is enough.
   */
  const [target, setTarget] = useState<CollectionCard | null>(null);

  const onLongPress = useCallback(
    (id: number) => setTarget(listed.find((card) => card.id === id) ?? null),
    [listed],
  );

  /*
   * The tracks are fetched at press time rather than subscribed to. Each of
   * these actions needs the contents once and never again, and a live query per
   * long-pressed album would leave this screen watching whatever a finger
   * happened to rest on.
   */
  const onAction = useCallback(
    (action: CollectionAction) => {
      const card = target;
      setTarget(null);
      if (!card) return;

      if (action === 'favorite') {
        void setAlbumFavorite(card.id, !card.isFavorite);
        return;
      }

      void (async () => {
        const contents = await listCollectionTracks(kind, card.id);
        if (action === 'playNext') playNext(contents);
        else if (action === 'addToQueue') addToQueue(contents);
        else deletion.ask(contents);
      })();
    },
    [addToQueue, deletion, kind, playNext, target],
  );

  const fallback = t(kind === 'artist' ? 'common.unknownArtist' : 'common.unknownAlbum');

  return (
    <>
      {/* Albums only. Artists have no flag of their own, so a heart there would
          filter to nothing every time. */}
      {kind === 'album' ? (
        <View className="mb-4 flex-row justify-end px-6">
          <LikedFilter
            active={likedOnly}
            onChange={setLikedOnly}
            accessibilityLabel={t('library.likedAlbumFilter')}
          />
        </View>
      ) : null}

      {/*
        Every view owns whatever height is left, explicitly. Without a bounded
        flex parent a virtualized list keeps the height it first measured.
      */}
      <View className="flex-1">
        {isLoading ? (
          <SkeletonCards />
        ) : (
          <CollectionGrid
            kind={kind}
            cards={listed}
            icon={kind === 'artist' ? User : Disc3}
            onPress={onOpen}
            onLongPress={onLongPress}
            empty={
              /* The shelf is not empty, the filter is — and the heart that
                 emptied it is still on screen to turn back off. */
              likedOnly ? (
                <EmptyState icon={HeartOff} messages={[t('library.noLikedAlbums')]} />
              ) : null
            }
          />
        )}
      </View>

      <CollectionActionSheet
        name={target === null ? null : target.isUnknown ? fallback : (target.name ?? fallback)}
        trackCount={target?.trackCount ?? 0}
        canDelete={deletion.canDelete}
        canFavorite={kind === 'album' && target !== null && target.id !== 0}
        isFavorite={target?.isFavorite ?? false}
        onSelect={onAction}
        onClose={() => setTarget(null)}
      />

      {/*
        The system draws the dialog that deletes; this one says how many first.
        Deleting a record on Android 10 means one system prompt per track, and
        that is not something to find out after tapping.
      */}
      <ConfirmDialog
        visible={deletion.pending.length > 0}
        title={t('track.deleteConfirm.title', { count: deletion.pending.length })}
        body={t('track.deleteConfirm.body', { count: deletion.pending.length })}
        confirmLabel={t('track.delete')}
        destructive
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />
    </>
  );
}
