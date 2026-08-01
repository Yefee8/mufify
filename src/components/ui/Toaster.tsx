import { X } from 'lucide-react-native';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { dismissToast, getToast, subscribeToast } from '@/services/toast';
import { useReducedMotion } from '@/theme/useReducedMotion';
import { useThemeColors } from '@/theme/useTheme';

/**
 * Where transient confirmations appear.
 *
 * Mounted once, directly above the mini player in the tab bar stack. It is the
 * only subscriber to the toast store, so a toast re-renders this and nothing
 * else — a message confirming a swipe must not cost a re-render of the list that
 * was swiped.
 *
 * Non-blocking in the strict sense: it occupies no space and takes no touches
 * except on the pill itself. `position: absolute` keeps it out of the tab bar's
 * layout so the bar does not shift when a toast appears, and `box-none` lets
 * everything except the pill fall through to the list underneath.
 */
export function Toaster() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const toast = useSyncExternalStore(subscribeToast, getToast);

  if (toast === null) return null;

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 bottom-full items-center px-6 pb-3"
    >
      <Animated.View
        /*
         * Keyed on the toast id so a repeated message replays the animation
         * rather than silently swapping text in a pill that is already up.
         */
        key={toast.id}
        entering={reducedMotion ? undefined : FadeInDown.duration(160)}
        exiting={reducedMotion ? undefined : FadeOutDown.duration(160)}
        className="max-w-full flex-row items-center gap-3 rounded-sm border border-subtle bg-surface-elevated px-4 py-3"
      >
        <Text numberOfLines={2} className="shrink font-body text-sm text-primary">
          {toast.message}
        </Text>

        {/* Dismissible, per the requirement that it never gets in the way. */}
        <Pressable
          onPress={dismissToast}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          hitSlop={12}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <X color={colors.legend} size={18} strokeWidth={2} />
        </Pressable>
      </Animated.View>
    </View>
  );
}
