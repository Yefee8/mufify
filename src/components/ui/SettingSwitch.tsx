import type { LucideIcon } from 'lucide-react-native';
import { Switch, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface SettingSwitchProps {
  icon: LucideIcon;
  /** Already translated. */
  label: string;
  /** Already translated. Says what turning it on actually changes. */
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

/**
 * A setting that is on or off.
 *
 * The platform `Switch` rather than a custom control: it is the one widget
 * users recognise instantly, it already answers to the system font scale and to
 * TalkBack, and reimplementing it would trade all of that for a marginally
 * better fit with the panel.
 *
 * Its colours are props rather than classes — `Switch` is a native component and
 * NativeWind cannot reach inside it — so they come from the same tokens the
 * classes do, via `useThemeColors`.
 */
export function SettingSwitch({
  icon: Icon,
  label,
  description,
  value,
  onChange,
}: SettingSwitchProps) {
  const colors = useThemeColors();

  return (
    <View className="flex-row items-start gap-3">
      <View className="pt-1">
        <Icon color={colors.legend} size={20} strokeWidth={2} />
      </View>

      <View className="flex-1 gap-1">
        <Text className="font-body text-base text-primary">{label}</Text>
        <Text className="font-body text-sm text-muted">{description}</Text>
      </View>

      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        accessibilityHint={description}
        trackColor={{ false: colors.etch, true: colors.signal }}
        thumbColor={colors.panel}
      />
    </View>
  );
}
