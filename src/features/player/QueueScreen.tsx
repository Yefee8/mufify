import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { ChevronDown, ListX, Music } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/ui/EmptyState';
import { AudioEngine, type QueueSnapshot } from '@/services/audio/AudioEngine';
import type { PlayableTrack } from '@/services/audio/types';
import * as perf from '@/services/perf';
import { useThemeColors } from '@/theme/useTheme';

import { QueueRow } from './components/QueueRow';

/** Every row is exactly this tall, from `h-16` on `QueueRow`. Keep in step. */
const ROW_HEIGHT = 64;

/**
 * How far beyond the viewport to render, in px.
 *
 * FlashList's default is 250, which with 64px rows is under four rows of
 * buffer. The track list settled on 1200 for the same reason: a fling outruns
 * a smaller buffer and leaves blank rows behind it.
 */
const DRAW_DISTANCE = 1_200;

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

  /*
   * Memoized against the snapshot, which only changes when the queue or index
   * really moves. Rebuilding it per render allocated one object per track —
   * 531 of them on the library queue — every time anything on this screen
   * changed, including the header's own re-render.
   */
  const items: QueueItem[] = useMemo(
    () => snapshot.tracks.map((track, position) => ({ track, position })),
    [snapshot],
  );

  useEffect(() => {
    perf.measure('queue.toFirstRows', items.length);
    // Mount only: this measures how long the sheet took to have content in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLoad = useCallback(() => perf.measure('queue.toFirstPaint'), []);

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
    /* `bottom` as well as `top`: this is a full-screen sheet now, not a route
       inside a navigator that was insetting it, so the last queue row would sit
       under the navigation bar the way the transport row did. */
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
      {/*
        Laid out rather than spaced apart. This was `justify-between` over three
        children where the third was the clear button or, when the queue was
        empty, an invisible box the same size — so the close button and the
        title were positioned by whatever the far side happened to be, and were
        reported missing on a device while the clear button beside them drew
        fine. A fixed left slot, a title that takes the space that is left, and
        a button that sizes to its own content cannot do that: nothing here
        depends on what its neighbour is.
      */}
      <View className="flex-row items-center gap-2 px-4 pt-6">
        {/*
          `h-11 w-11`, not `min-h-11 min-w-11`, and `collapsable={false}`.

          This is the one control that kept vanishing after the header was
          otherwise fixed — visible for a frame, then gone, on the phone but
          never on the emulator. Both changes remove a way that can happen.
          A minimum size still leaves the box to be measured, and a box whose
          only child is an SVG measures to nothing if that child has not laid
          out yet; an explicit 44 × 44 is the touch target we want anyway and
          cannot be squeezed. `collapsable={false}` stops Android flattening
          the view away, which is what it does to a container with no
          background of its own — and this one sits inside two stacked,
          opacity-animated, full-screen layers, which is where that goes wrong.
        */}
        <Pressable
          onPress={onClose}
          collapsable={false}
          accessibilityRole="button"
          accessibilityLabel={t('queue.close')}
          className="h-11 w-11 items-center justify-center"
        >
          <ChevronDown color={colors.label} size={26} strokeWidth={2} />
        </Pressable>

        <Text numberOfLines={1} className="flex-1 font-body-medium text-base text-primary">
          {t('queue.title')}
        </Text>

        {/*
          A button with a word on it, not a bare glyph. Clearing the queue is
          the one destructive thing on this screen and `ListX` is not a symbol
          anybody recognises — the same reasoning that made "Yeni liste" on the
          playlists screen a labelled button rather than a plus.
        */}
        {items.length > 0 ? (
          <Pressable
            onPress={clear}
            accessibilityRole="button"
            android_ripple={{ color: colors.etch }}
            className="min-h-11 flex-row items-center gap-2 rounded-sm border border-subtle px-4"
          >
            <ListX color={colors.legend} size={18} strokeWidth={2} />
            <Text className="font-body-medium text-sm text-primary">{t('queue.clear')}</Text>
          </Pressable>
        ) : null}
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
          <FlashList
            data={items}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            /*
              Uniform rows, so FlashList never measures one. Without this it
              lays out a batch, measures it, and lays it out again — which is
              paid on the frames the sheet is arriving on, and is why the queue
              seemed to show up late even though mounting it took 33ms.
            */
            overrideItemLayout={setRowHeight}
            drawDistance={DRAW_DISTANCE}
            onLoad={onLoad}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

/** Uniform rows, so FlashList can skip measurement entirely. */
function setRowHeight(layout: { span?: number; size?: number }): void {
  layout.size = ROW_HEIGHT;
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
