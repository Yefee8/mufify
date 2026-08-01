import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactElement } from 'react';
import { useCallback } from 'react';
import { View } from 'react-native';

import type { CollectionCard as Card } from '@/db/queries/tracks';

import { CollectionCard } from './CollectionCard';

/** Cards per row. Two keeps the covers big enough to recognise on a phone. */
const COLUMNS = 2;

export interface CollectionGridProps {
  cards: readonly Card[];
  icon: LucideIcon;
  onPress: (id: number) => void;
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
export function CollectionGrid({ cards, icon, onPress, empty }: CollectionGridProps) {
  const renderItem = useCallback<ListRenderItem<Card>>(
    ({ item }) => (
      // Gutter as padding on the cell rather than a gap on the list: FlashList
      // sizes cells itself, and a gap would be applied outside that measurement.
      <View className="flex-1 p-2">
        <CollectionCard card={item} icon={icon} onPress={onPress} />
      </View>
    ),
    [icon, onPress],
  );

  return (
    <FlashList
      data={cards}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      numColumns={COLUMNS}
      contentContainerClassName="px-4"
      ListEmptyComponent={empty}
    />
  );
}

function keyExtractor(card: Card): string {
  return String(card.id);
}
