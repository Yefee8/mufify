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
}

/**
 * A row of mutually exclusive choices. Indigo marks the selected one — the
 * only place colour is used here.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  const colors = useThemeColors();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      className="flex-row gap-2"
    >
      {options.map((option) => {
        const selected = option.value === value;
        const Icon = option.icon;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
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
              <Icon color={selected ? colors.onSignal : colors.legend} size={16} strokeWidth={2} />
            ) : null}
            <Text
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
    </View>
  );
}
