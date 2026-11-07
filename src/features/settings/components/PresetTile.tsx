import { User } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { CurvePoint } from '@/services/equalizer/presets';
import { useThemeColors } from '@/theme/useTheme';

import { PresetCurve } from './PresetCurve';

export interface PresetTileProps {
  label: string;
  /** Read out with the label, since the tile itself shows no sentence. */
  hint: string;
  points: readonly CurvePoint[];
  selected: boolean;
  /** One the user saved. Marked, and long-pressable for share and delete. */
  mine?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

const CURVE_WIDTH = 72;
const CURVE_HEIGHT = 26;

/**
 * One preset: its shape, its name, and whether it is the one playing.
 *
 * **Selected means filled.** The picker this replaced marked the selection
 * with a small tick inside a sheet you had to open, and a name in a row that
 * looked the same whichever preset it named; "which one is on?" was a question
 * the screen made you work for. A tile in the accent colour, with its curve
 * drawn in the colour that sits on the accent, answers it from across the room.
 * Contrast for that pair is asserted in `tokens.test.ts`.
 *
 * The user's own presets are the same tile with a small person beside the name
 * — the same shelf, not a separate list in a separate section.
 */
export const PresetTile = memo(function PresetTile({
  label,
  hint,
  points,
  selected,
  mine = false,
  onPress,
  onLongPress,
}: PresetTileProps) {
  const colors = useThemeColors();
  const ink = selected ? colors.onSignal : colors.signal;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      android_ripple={{ color: colors.etch }}
      className={
        selected
          ? 'min-h-16 items-center justify-center gap-1 rounded-sm border border-accent bg-accent px-2 py-2'
          : 'min-h-16 items-center justify-center gap-1 rounded-sm border border-subtle bg-surface px-2 py-2'
      }
    >
      <PresetCurve
        points={points}
        width={CURVE_WIDTH}
        height={CURVE_HEIGHT}
        color={ink}
        baseline={selected ? colors.onSignal : colors.etch}
      />
      <View className="flex-row items-center gap-1">
        {mine ? <User color={ink} size={12} strokeWidth={2.5} /> : null}
        <Text
          numberOfLines={1}
          className={
            selected
              ? 'font-body-semibold text-sm text-on-accent'
              : 'font-body-medium text-sm text-primary'
          }
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
});
