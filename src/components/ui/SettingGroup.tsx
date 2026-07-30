import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

export interface SettingGroupProps {
  /** Already translated. */
  title: string;
  children: ReactNode;
}

/** A titled block of settings on an elevated panel. */
export function SettingGroup({ title, children }: SettingGroupProps) {
  return (
    <View className="gap-3">
      <Text className="font-body-semibold text-sm text-muted">{title}</Text>
      <View className="gap-4 rounded-md border border-subtle bg-surface-elevated p-4">
        {children}
      </View>
    </View>
  );
}
