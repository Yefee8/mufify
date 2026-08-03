import { SafeAreaView } from 'react-native-safe-area-context';

import { Sheet } from '@/components/ui/Sheet';

import { PlayerScreen } from '../PlayerScreen';
import { playerExpansion } from '../playerExpansion';

export interface NowPlayingOverlayProps {
  /** Keeps the expensive player contents out of the collapsed render path. */
  visible: boolean;
  /** Enables controls only after the opening gesture has settled. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean, velocity?: number) => void;
  /** Opens the queue, which is a root-level surface rather than a route. */
  onOpenQueue: () => void;
  /** Mounts the queue on press-in, before the opening spring starts. */
  onPrepareQueue: () => void;
  /**
   * The queue is open over this, so there is nothing here to see.
   *
   * Not a nicety. Two stacked full-screen sheets composite unreliably on some
   * devices — the spec strip and the track duration from this screen were
   * reported drawing *in front of* the queue's rows, and rows behind them came
   * out black. Nothing draws through a surface that is not being rendered.
   */
  obscured: boolean;
}

/**
 * Root-mounted Now Playing surface driven directly by the mini-player gesture.
 *
 * The motion moved into `Sheet`, which the queue now shares. What is left here
 * is what is actually specific to this surface: its layer, and the safe area,
 * which it insets on both edges because its transport row would otherwise sit
 * under the navigation bar.
 */
export function NowPlayingOverlay({
  visible,
  expanded,
  onExpandedChange,
  onOpenQueue,
  onPrepareQueue,
  obscured,
}: NowPlayingOverlayProps) {
  return (
    <Sheet
      progress={playerExpansion}
      visible={visible}
      expanded={expanded}
      className="absolute inset-0 z-30 bg-surface"
    >
      {/*
        Dropped while the queue covers it, and brought back the moment the queue
        starts leaving rather than when it has left — `expanded` flips at the
        start of the close, so the remount happens behind a sheet that is still
        opaque and nobody sees it. It also stops this screen re-rendering twice
        a second for a scrubber nobody can see.
      */}
      {obscured ? null : (
        <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface">
          <PlayerScreen
            onExpandedChange={onExpandedChange}
            onOpenQueue={onOpenQueue}
            onPrepareQueue={onPrepareQueue}
          />
        </SafeAreaView>
      )}
    </Sheet>
  );
}
