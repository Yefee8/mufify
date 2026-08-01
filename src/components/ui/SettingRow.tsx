import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface SettingRowProps {
  /** Reflects the current value where one icon can (sun / moon / monitor). */
  icon: LucideIcon;
  /** Already translated. */
  label: string;
  /** The current value, spelled out. Sits right, in the muted tone. */
  value?: string;
  /**
   * One line saying what this setting does. Already translated.
   *
   * Not optional by preference — every row should have one. It is typed as
   * optional only because a row whose control is itself self-describing (an
   * `OptionList`, which explains each choice) would otherwise say the same thing
   * twice.
   */
  description?: string;
  /** The control itself — an option list, a switch, a link. */
  children?: ReactNode;
}

/**
 * Label, current value, an explanation, and the control underneath.
 *
 * The explanation is the point of this component. A settings screen that lists
 * only names makes the user guess, and the guesses are wrong in exactly the
 * places that matter — nobody knows what "Discovery" does from the word alone.
 */
export function SettingRow({
  icon: Icon,
  label,
  value,
  description,
  children,
}: SettingRowProps) {
  const colors = useThemeColors();

  return (
    <View className="gap-3">
      <View className="flex-row items-start gap-3">
        {/* Nudged down so the icon sits on the label's centre line rather than
            the top of a block that may be two lines tall. */}
        <View className="pt-1">
          <Icon color={colors.legend} size={20} strokeWidth={2} />
        </View>

        <View className="flex-1 gap-1">
          <Text className="font-body text-base text-primary">{label}</Text>
          {description ? (
            <Text className="font-body text-sm text-muted">{description}</Text>
          ) : null}
        </View>

        {value ? <Text className="pt-1 font-body text-sm text-muted">{value}</Text> : null}
      </View>

      {children}
    </View>
  );
}
