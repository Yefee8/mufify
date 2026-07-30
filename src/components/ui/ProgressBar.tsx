import { View } from 'react-native';

export interface ProgressBarProps {
  /** 0–1. Values outside that are clamped rather than overflowing the track. */
  value: number;
  /** Already translated, for screen readers. */
  accessibilityLabel: string;
}

/**
 * A determinate bar. Indigo is the fill because this is an active state — the
 * one thing on the screen that is happening.
 */
export function ProgressBar({ value, accessibilityLabel }: ProgressBarProps) {
  const clamped = Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1);
  const percent = Math.round(clamped * 100);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      className="h-1 w-full overflow-hidden rounded-full bg-surface-elevated"
    >
      {/*
        One of the documented exceptions to the no-inline-style rule: a width
        that changes every frame cannot be a class, and an arbitrary value is
        banned too. Everything else here is a token.
      */}
      <View className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
    </View>
  );
}
