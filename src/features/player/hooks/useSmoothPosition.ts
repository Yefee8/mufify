import { useEffect, useRef, useState } from 'react';

import { AudioEngine } from '@/services/audio/AudioEngine';

/**
 * Playback position, estimated between the engine's reports.
 *
 * The engine reports twice a second, which is right for a scrubber and a clock
 * and wrong for a lyric that is supposed to land on the beat: a line would
 * highlight up to half a second after it is sung, and the delay would be
 * visibly different every time.
 *
 * So the last report is treated as a fix — a position and the moment it
 * arrived — and the time since is added to it while the audio is playing. The
 * clock is the same one the audio runs on, so the two do not drift within the
 * 500ms between fixes, and every fix corrects whatever did.
 *
 * Only mounted while the words are on screen. A timer this often is not
 * something to leave running behind the artwork.
 */
export function useSmoothPosition(active: boolean, intervalMs = 100): number {
  const [positionMs, setPositionMs] = useState(() => AudioEngine.getState().positionMs);
  const fix = useRef({ positionMs: 0, at: 0, playing: false });

  useEffect(() => {
    if (!active) return;

    /*
     * The subscription records the fix; the timer is the only thing that sets
     * state. Reporting from inside the subscription as well would be a second
     * source of renders for the same information — and `AudioEngine.subscribe`
     * calls its listener immediately, which would be a state update raised
     * directly by mounting this effect.
     */
    const unsubscribe = AudioEngine.subscribe((state) => {
      fix.current = {
        positionMs: state.positionMs,
        at: Date.now(),
        playing: state.phase === 'playing',
      };
    });

    const timer = setInterval(() => {
      const { positionMs: base, at, playing } = fix.current;
      // Paused: the last fix stands until the next one arrives.
      setPositionMs(playing ? base + (Date.now() - at) : base);
    }, intervalMs);

    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [active, intervalMs]);

  return positionMs;
}
