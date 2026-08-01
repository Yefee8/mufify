import type { LucideIcon } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface SegmentedControlOption<T extends string> {
  value: T;
  /** Already translated. */
  label: string;
  icon?: LucideIcon;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Translated group label, for screen readers. */
  accessibilityLabel: string;
  /**
   * How many choices fit on a line before wrapping. Omitted means one line,
   * however many there are.
   *
   * Five options on one line is what this looked like before, and the labels
   * were unreadable: each got about a fifth of the width minus padding, and
   * "Discovery" and "Favourites" clipped — in Turkish, where strings run 10–20%
   * longer, worse. Three per line is the widest that keeps a word legible at
   * the large font scales the accessibility pass has to survive.
   */
  perRow?: number;
}

/**
 * A group of mutually exclusive choices. Indigo marks the selected one — the
 * only place colour is used here.
 *
 * Wrapping is opt-in via `perRow` rather than automatic: two or three options
 * genuinely want one line and equal widths, and flex-wrap with `flex-1` would
 * give the last row's single item the full width, which reads as a different
 * kind of control rather than as the same one continued.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  perRow,
}: SegmentedControlProps<T>) {
  const colors = useThemeColors();
  const rows = perRow ? chunk(options, perRow) : [options];

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} className="gap-2">
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-2">
          {row.map((option) => {
            const selected = option.value === value;
            const Icon = option.icon;
            return (
              <Pressable
                key={option.value}
                onPress={() => onChange(option.value)}
                android_ripple={{ color: selected ? colors.onSignal : colors.etch }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
                className={
                  selected
                    ? 'min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-sm bg-accent px-3'
                    : 'min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-sm border border-subtle px-3'
                }
              >
                {Icon ? (
                  <Icon
                    color={selected ? colors.onSignal : colors.legend}
                    size={16}
                    strokeWidth={2}
                  />
                ) : null}
                <Text
                  numberOfLines={1}
                  className={
                    selected
                      ? 'font-body-medium text-sm text-on-accent'
                      : 'font-body text-sm text-muted'
                  }
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}

          {/*
            A short last row is padded with invisible flex so its buttons keep
            the width of the rows above. Without this, five options across three
            per row give a final pair that is half again as wide as the first
            three, which looks like a mistake rather than a wrap.
          */}
          {padding(row.length, perRow).map((key) => (
            <View key={key} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}

/** Keys for the invisible spacers that keep a short last row aligned. */
function padding(rowLength: number, perRow: number | undefined): string[] {
  if (perRow === undefined) return [];
  return Array.from({ length: perRow - rowLength }, (_, index) => `pad-${index}`);
}
