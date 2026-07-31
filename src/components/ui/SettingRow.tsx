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
  value: string;
  /** The control itself — a segmented control, a switch, a link. */
  children: ReactNode;
}

/** Label and current value on one line, with the control underneath. */
export function SettingRow({ icon: Icon, label, value, children }: SettingRowProps) {
  const colors = useThemeColors();

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3">
        <Icon color={colors.legend} size={20} strokeWidth={2} />
        <Text className="flex-1 font-body text-base text-primary">{label}</Text>
        <Text className="font-body text-sm text-muted">{value}</Text>
      </View>
      {children}
    </View>
  );
}
