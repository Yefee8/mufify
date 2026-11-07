import { Music } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, useWindowDimensions, View } from 'react-native';

import { EmptyState } from '@/components/ui/EmptyState';
import { AudioEngine } from '@/services/audio/AudioEngine';
import { cycleRepeat } from '@/services/audio/queue';
import type { RepeatMode } from '@/services/audio/types';
import { formatDuration } from '@/services/format/duration';
import * as perf from '@/services/perf';

import { ArtworkCarousel } from './components/ArtworkCarousel';
import { LyricsPane } from './components/LyricsPane';
import { NowPlayingTitle } from './components/NowPlayingTitle';
import { PlayerHeader } from './components/PlayerHeader';
import { PlayerTransport } from './components/PlayerTransport';
import { Scrubber } from './components/Scrubber';
import { SpecStrip } from './components/SpecStrip';
import { useLyrics } from './hooks/useLyrics';
import { usePlayback, usePlaybackControls } from './hooks/usePlayback';
import { useQueueNeighbours } from './hooks/useQueueNeighbours';

/**
 * Now Playing.
 *
 * The root player overlay rather than a route. It stays mounted above every
 * screen so the mini player and this surface share one gesture progress value.
 */
export interface PlayerScreenProps {
  onExpandedChange: (expanded: boolean, velocity?: number) => void;
  /** The queue is a root-level surface, not a route. See `QueueOverlay`. */
  onOpenQueue: () => void;
  /** Mounts the queue when the finger lands, not when it lifts. */
  onPrepareQueue: () => void;
}

/** The same short window `ShortWindowSplit` and `Screen` mean. */
const SHORT_HEIGHT = 520;

export function PlayerScreen({ onExpandedChange, onOpenQueue, onPrepareQueue }: PlayerScreenProps) {
  const { t, i18n } = useTranslation();
  const { height } = useWindowDimensions();

  const { phase, track, positionMs, durationMs, error } = usePlayback();
  const { toggle, toggleShuffle, next, previous, seekTo } = usePlaybackControls();
  const neighbours = useQueueNeighbours();
  const [repeat, setRepeatState] = useState<RepeatMode>(() => AudioEngine.getRepeat());
  const [shuffled, setShuffledState] = useState(() => AudioEngine.isShuffled());

  const { lyrics } = useLyrics(track?.id ?? null, track?.uri ?? null);

  /*
   * Which track's words are open, rather than a boolean.
   *
   * The words close when the track changes, and holding the id is how that
   * happens without an effect mirroring one piece of state onto another.
   * Staying open across a track change would be defensible if the next track
   * had lyrics, and most do not — the screen would empty out under the
   * listener instead of showing them what is now playing.
   */
  const [lyricsFor, setLyricsFor] = useState<number | null>(null);
  const showLyrics = track !== null && lyricsFor === track.id;

  const toggleLyrics = useCallback(
    () => setLyricsFor((open) => (open === null ? (track?.id ?? null) : null)),
    [track?.id],
  );

  const close = useCallback(() => onExpandedChange(false), [onExpandedChange]);

  /* Timed because "the queue takes ages to appear" needs a number, not a guess. */
  const openQueue = useCallback(() => {
    perf.mark('queue.toFirstRows');
    perf.mark('queue.toFirstPaint');
    onOpenQueue();
  }, [onOpenQueue]);

  const onShufflePress = useCallback(() => {
    toggleShuffle();
    setShuffledState(AudioEngine.isShuffled());
  }, [toggleShuffle]);

  const onRepeatPress = useCallback(() => {
    const nextMode = cycleRepeat(repeat);
    AudioEngine.setRepeat(nextMode);
    setRepeatState(nextMode);
  }, [repeat]);

  if (track === null) {
    return (
      <View className="flex-1 bg-surface">
        <PlayerHeader
          onClose={close}
          onOpenQueue={openQueue}
          onPrepareQueue={onPrepareQueue}
          label={t('player.title')}
        />
        <EmptyState icon={Music} messages={[t('player.empty')]} />
      </View>
    );
  }

  /*
   * A landscape phone has about 411 points of height and this column needs
   * every one of them: header, cover, title, scrubber, transport and the spec
   * strip. At the usual spacing the strip fell off the bottom edge — not
   * scrollable, not reachable. Tightening the gaps is what buys it back; the
   * cover keeps whatever is left, which sideways is not much, and that is the
   * honest trade for a screen the app does not lay out twice.
   */
  const short = height < SHORT_HEIGHT;

  return (
    <View className="flex-1 bg-surface">
      <PlayerHeader
        onClose={close}
        onOpenQueue={openQueue}
        onPrepareQueue={onPrepareQueue}
        label={t('player.title')}
      />

      {/*
        `gap-6`, not `gap-8`. Three gaps of 32 between four blocks was 96 dp of
        air the column did not have — see `artworkSize.ts` for what the overflow
        did to both ends of the screen.
      */}
      <View className={short ? 'flex-1 gap-2 pb-1' : 'flex-1 gap-6 pb-4'}>
        {/*
          The artwork carries the gestures, not the whole screen: the scrubber
          below owns a pan of its own, and two competing pans on one surface
          means a scrub that sometimes dismisses the screen instead.

          Down dismisses, which is what the brief asks for and what Android's
          modal presentation does not give on its own. Sideways moves through the
          queue with the neighbouring covers already on screen.
        */}
        {showLyrics && lyrics !== null ? (
          <LyricsPane lyrics={lyrics} onSeek={seekTo} />
        ) : (
          <ArtworkCarousel
            neighbours={neighbours}
            onNext={next}
            onPrevious={previous}
            onExpandedChange={onExpandedChange}
          />
        )}

        <NowPlayingTitle
          track={track}
          hasLyrics={lyrics !== null}
          showLyrics={showLyrics}
          onToggleLyrics={toggleLyrics}
        />

        {phase === 'error' ? (
          <Text className="px-6 font-body text-sm text-muted">
            {t('player.error')}
            {error ? ` ${error}` : ''}
          </Text>
        ) : (
          <View className="gap-2 px-6">
            <Scrubber
              positionMs={positionMs}
              durationMs={durationMs}
              onSeek={seekTo}
              accessibilityLabel={t('player.seek')}
            />
            <View className="flex-row justify-between">
              <Text className="font-mono text-sm text-muted">
                {formatDuration(positionMs, i18n.language)}
              </Text>
              <Text className="font-mono text-sm text-muted">
                {formatDuration(durationMs, i18n.language)}
              </Text>
            </View>
          </View>
        )}

        <PlayerTransport
          phase={phase}
          repeat={repeat}
          shuffled={shuffled}
          onRepeat={onRepeatPress}
          onPrevious={previous}
          onToggle={toggle}
          onNext={next}
          onShuffle={onShufflePress}
        />

        {/*
          Below the transport, not under the title.
          
          It is reference material — container, rate, depth, bitrate — and it
          was sitting between the track's name and the controls, which put the
          two things a thumb reaches for furthest apart. Everything that is
          pressed is now in the bottom third; the strip reads underneath it.
        */}
        <View className="px-6">
          <SpecStrip trackId={track.id} />
        </View>
      </View>
    </View>
  );
}
