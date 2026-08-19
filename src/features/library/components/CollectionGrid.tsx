import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactElement } from 'react';
import { useCallback } from 'react';
import { View } from 'react-native';

import type { CollectionCard as Card } from '@/db/queries/tracks';
import { useMiniPlayerInset } from '@/features/player/playerLayerLayout';
import { SPACING } from '@/theme/tokens';

import { CollectionCard } from './CollectionCard';

/** Cards per row. Two keeps the covers big enough to recognise on a phone. */
const COLUMNS = 2;

export interface CollectionGridProps {
  kind: 'artist' | 'album';
  cards: readonly Card[];
  icon: LucideIcon;
  onPress: (id: number) => void;
  /** Opens the collection's actions. */
  onLongPress: (id: number) => void;
  empty: ReactElement | null;
}

/**
 * A grid of artist or album cards.
 *
 * FlashList with `numColumns`, not a wrapping flex row: an artist grid is as
 * long as the library is wide, and the performance rule puts every long list on
 * FlashList without exception. Three thousand albums laid out in a ScrollView
 * would mount three thousand images.
 *
 * No `overrideItemLayout` here, unlike the track list. Card height depends on
 * the width the grid is given — the cover is square — so a hardcoded size would
 * be wrong on the first rotation. Cards are uniform, so FlashList measures one
 * and reuses it.
 */
export function CollectionGrid({
  kind,
  cards,
  icon,
  onPress,
  onLongPress,
  empty,
}: CollectionGridProps) {
  const bottomInset = useMiniPlayerInset();

  const renderItem = useCallback<ListRenderItem<Card>>(
    ({ item }) => (
      // Gutter as padding on the cell rather than a gap on the list: FlashList
      // sizes cells itself, and a gap would be applied outside that measurement.
      <View className="flex-1 p-2">
        <CollectionCard
          kind={kind}
          card={item}
          icon={icon}
          onPress={onPress}
          onLongPress={onLongPress}
        />
      </View>
    ),
    [kind, icon, onPress, onLongPress],
  );

  return (
    <FlashList
      data={cards}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={COLUMNS}
      /*
        One style rather than a class plus a style. The bottom inset is a
        runtime measurement — the transport strip's height — which no Tailwind
        class can carry, and mixing `contentContainerClassName` with
        `contentContainerStyle` leaves which padding wins to NativeWind's merge
        order. The values are still design-system tokens.
      */
      contentContainerStyle={{ paddingHorizontal: SPACING[4], paddingBottom: bottomInset }}
      ListEmptyComponent={empty}
    />
  );
}

function keyExtractor(card: Card): string {
  return String(card.id);
}
