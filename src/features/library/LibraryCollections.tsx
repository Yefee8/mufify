import { Disc3, User } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { listCollectionTracks, type CollectionCard } from '@/db/queries/tracks';

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

  /*
   * Held as the card rather than as an id. The sheet shows a name and a count,
   * and re-deriving those from the grid would let its contents change under it
   * while it is open — a rescan finishing mid-press is enough.
   */
  const [target, setTarget] = useState<CollectionCard | null>(null);

  const onLongPress = useCallback(
    (id: number) => setTarget(cards.find((card) => card.id === id) ?? null),
    [cards],
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
            cards={cards}
            icon={kind === 'artist' ? User : Disc3}
            onPress={onOpen}
            onLongPress={onLongPress}
            empty={null}
          />
        )}
      </View>

      <CollectionActionSheet
        name={target === null ? null : target.isUnknown ? fallback : (target.name ?? fallback)}
        trackCount={target?.trackCount ?? 0}
        canDelete={deletion.canDelete}
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
