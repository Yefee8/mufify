import { ChevronDown, ListMusic } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface PlayerHeaderProps {
  onClose: () => void;
  onOpenQueue: () => void;
  onPrepareQueue: () => void;
  label: string;
}

/** Now Playing's top row: close on the left, the queue on the right. */
export function PlayerHeader({ onClose, onOpenQueue, onPrepareQueue, label }: PlayerHeaderProps) {
  const colors = useThemeColors();
  const { t } = useTranslation();

  return (
    <View className="flex-row items-center justify-between px-6 pt-6">
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('player.close')}
        className="min-h-11 min-w-11 items-center justify-start"
      >
        <ChevronDown color={colors.label} size={26} strokeWidth={2} />
      </Pressable>
      <Text className="font-body-medium text-sm text-muted">{label}</Text>
      <Pressable
        onPress={onOpenQueue}
        /*
          Mount the queue when the finger lands rather than when it lifts. A
          few hundred rows of FlashList is real work, and doing it on the frame
          the spring starts means the sheet arrives before its contents do —
          which is what "the queue takes ages" actually looked like. The same
          trick the mini player uses to open Now Playing.
        */
        onPressIn={onPrepareQueue}
        accessibilityRole="button"
        accessibilityLabel={t('queue.title')}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <ListMusic color={colors.label} size={22} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
