import { Check } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface Option<T extends string> {
  value: T;
  /** Already translated. */
  label: string;
  /** Already translated. One line saying what this choice actually does. */
  description: string;
}

export interface OptionListProps<T extends string> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Translated group label, for screen readers. */
  accessibilityLabel: string;
}

/**
 * One choice per row, each with a sentence explaining it.
 *
 * The alternative — a segmented control — is right when the options are
 * self-explanatory and wrong the moment they are not. "Discovery" and
 * "Favourites" are names, not descriptions, and the entire argument for offering
 * five shuffle algorithms is that a user can tell them apart. A control that
 * cannot fit the explanation is the wrong control.
 *
 * It also solves the layout problem honestly rather than by wrapping: five
 * segments across a phone gave each about a fifth of the width, and Turkish runs
 * 10–20% longer than English. A column has as much room as it needs in any
 * language and at any font scale.
 *
 * The tick marks the selection rather than a filled background: with a
 * description under every row, filling the selected one would put body text on
 * an indigo panel and cost the contrast the tokens guarantee.
 */
export function OptionList<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: OptionListProps<T>) {
  const colors = useThemeColors();

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} className="gap-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            accessibilityHint={option.description}
            className="min-h-11 flex-row items-start gap-3 py-2"
          >
            {/* Fixed-width gutter, so every title starts on the same column
                whether or not it is the selected one. */}
            <View className="w-5 items-center pt-1">
              {selected ? <Check color={colors.signal} size={18} strokeWidth={3} /> : null}
            </View>

            <View className="flex-1 gap-1">
              <Text
                className={
                  selected
                    ? 'font-body-medium text-base text-accent'
                    : 'font-body text-base text-primary'
                }
              >
                {option.label}
              </Text>
              <Text className="font-body text-sm text-muted">{option.description}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
