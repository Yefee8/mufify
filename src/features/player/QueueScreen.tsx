import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { ChevronDown, ListX, Music } from 'lucide-react-native';
import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/EmptyState';
import { AudioEngine, type QueueSnapshot } from '@/services/audio/AudioEngine';
import type { PlayableTrack } from '@/services/audio/types';
import { useThemeColors } from '@/theme/useTheme';

import { QueueRow } from './components/QueueRow';

/** Rows carry their queue position, which is what every action needs. */
interface QueueItem {
  track: PlayableTrack;
  position: number;
}

/**
 * What is playing and what comes after it.
 *
 * Subscribes to the engine's queue rather than its playback state: state is
 * emitted twice a second for the position, and re-rendering a few hundred rows
 * at that rate is exactly the jank the performance rules exist to prevent.
 */
export interface QueueScreenProps {
  /** Dismisses the sheet. Not `router.back()` — this is not a route. */
  onClose: () => void;
}

export function QueueScreen({ onClose }: QueueScreenProps) {
  const { t, i18n } = useTranslation();
  const colors = useThemeColors();

  const snapshot = useSyncExternalStore(subscribeQueue, getQueueSnapshot);

  const playAt = useCallback((position: number) => void AudioEngine.jumpTo(position), []);
  const removeAt = useCallback((position: number) => void AudioEngine.removeAt(position), []);

  const clear = useCallback(() => {
    void AudioEngine.clearQueue();
    onClose();
  }, [onClose]);

  const items: QueueItem[] = snapshot.tracks.map((track, position) => ({ track, position }));

  const renderItem = useCallback<ListRenderItem<QueueItem>>(
    ({ item }) => (
      <QueueRow
        track={item.track}
        position={item.position}
        isCurrent={item.position === snapshot.index}
        isPast={item.position < snapshot.index}
        locale={i18n.language}
        onPress={playAt}
        onRemove={removeAt}
      />
    ),
    [snapshot.index, i18n.language, playAt, removeAt],
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-surface">
      <View className="flex-row items-center justify-between px-4 pt-6">
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('queue.close')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <ChevronDown color={colors.label} size={26} strokeWidth={2} />
        </Pressable>

        <Text className="font-body-medium text-sm text-muted">{t('queue.title')}</Text>

        {items.length > 0 ? (
          <Pressable
            onPress={clear}
            accessibilityRole="button"
            accessibilityLabel={t('queue.clear')}
            className="min-h-11 min-w-11 items-center justify-center"
          >
            <ListX color={colors.legend} size={20} strokeWidth={2} />
          </Pressable>
        ) : (
          <View className="min-h-11 min-w-11" />
        )}
      </View>

      <View className="px-6 py-4">
        <Text className="font-mono text-sm text-muted">
          {t('queue.remaining', { count: Math.max(0, items.length - snapshot.index - 1) })}
        </Text>
      </View>

      {/* Bounded, so the list re-lays out when the rows above it change. */}
      <View className="flex-1">
        {items.length === 0 ? (
          <EmptyState icon={Music} messages={[t('queue.empty')]} />
        ) : (
          <FlashList data={items} renderItem={renderItem} keyExtractor={keyExtractor} />
        )}
      </View>
    </SafeAreaView>
  );
}

function keyExtractor(item: QueueItem): string {
  // Position, not track id: a queue may legitimately hold the same track twice.
  return `${item.track.id}-${item.position}`;
}

function subscribeQueue(onChange: () => void): () => void {
  return AudioEngine.subscribeQueue(onChange);
}

function getQueueSnapshot(): QueueSnapshot {
  return AudioEngine.getQueueSnapshot();
}
