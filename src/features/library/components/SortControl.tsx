import { ArrowDownUp, Check } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { panelInset } from '@/components/ui/panelInset';
import {
  chooseSort,
  isChronological,
  reverseSort,
  type SortDirection,
  type SortOrder,
} from '@/services/library/sortOrder';
import { SPACING } from '@/theme/tokens';
import { useThemeColors } from '@/theme/useTheme';

export interface SortControlProps<K extends string> {
  /** Which view's labels to use — the same key reads differently per shelf. */
  view: 'tracks' | 'albums' | 'artists';
  keys: readonly K[];
  order: SortOrder<K>;
  /** The order the view opens in, so a changed one can say so. */
  defaultOrder: SortOrder<K>;
  onChange: (order: SortOrder<K>) => void;
}

/**
 * The library's sort button and the sheet it opens.
 *
 * An icon in the search row rather than a row of its own: sorting is something
 * done once and then left alone, and a permanent strip of options would push
 * the list down for a choice made a few times a year. The icon turns accent
 * while a non-default order is in force, so a list that looks "wrong" says why
 * without having to open anything.
 *
 * In the sheet, choosing a key and reversing are separate, both one tap, and
 * both close the sheet — the list behind is the confirmation. Reverse is a
 * labelled button rather than "tap the selected row again", because the request
 * was for reversing to be *allowed*, and a gesture nobody can see is not that.
 */
export function SortControl<K extends string>({
  view,
  keys,
  order,
  defaultOrder,
  onChange,
}: SortControlProps<K>) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const labelOf = (key: K) => t(`library.sort.keys.${view}.${key}`);
  const changed = order.key !== defaultOrder.key || order.direction !== defaultOrder.direction;

  const pick = useCallback(
    (key: K) => {
      setOpen(false);
      onChange(chooseSort(order, key));
    },
    [onChange, order],
  );

  const reverse = useCallback(() => {
    setOpen(false);
    onChange(reverseSort(order));
  }, [onChange, order]);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('library.sort.button')}
        accessibilityValue={{
          text: t('library.sort.current', {
            key: labelOf(order.key),
            direction: t(directionLabel(order.key, order.direction)),
          }),
        }}
        android_ripple={{ color: colors.etch, radius: 24 }}
        className={
          changed
            ? 'min-h-11 min-w-11 items-center justify-center rounded-sm border border-accent px-3'
            : 'min-h-11 min-w-11 items-center justify-center rounded-sm border border-subtle px-3'
        }
      >
        <ArrowDownUp color={changed ? colors.signal : colors.legend} size={18} strokeWidth={2} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          className="flex-1 justify-end bg-surface/80"
        >
          <Pressable
            onPress={absorb}
            style={panelInset(insets, { bottom: SPACING[5], side: SPACING[5] })}
            className="max-h-full rounded-md border border-subtle bg-surface-elevated pt-5"
          >
            <View className="flex-row items-center justify-between pb-2">
              <Text
                accessibilityRole="header"
                className="font-body-semibold text-base text-primary"
              >
                {t('library.sort.title')}
              </Text>

              <Pressable
                onPress={reverse}
                accessibilityRole="button"
                accessibilityLabel={t('library.sort.reverse')}
                accessibilityHint={t('library.sort.reverseHint')}
                className="min-h-11 flex-row items-center gap-2 rounded-sm border border-subtle px-3"
              >
                <ArrowDownUp color={colors.signal} size={16} strokeWidth={2} />
                <Text className="font-body-medium text-sm text-accent">
                  {t('library.sort.reverse')}
                </Text>
              </Pressable>
            </View>

            <ScrollView>
              {keys.map((key) => (
                <Row
                  key={key}
                  label={labelOf(key)}
                  selected={key === order.key}
                  direction={
                    key === order.key ? t(directionLabel(order.key, order.direction)) : null
                  }
                  onPress={() => pick(key)}
                />
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

interface RowProps {
  label: string;
  selected: boolean;
  /** The selected row says which way it runs; the others say nothing. */
  direction: string | null;
  onPress: () => void;
}

function Row({ label, selected, direction, onPress }: RowProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={direction ? `${label}, ${direction}` : label}
      className="min-h-12 flex-row items-center gap-3 py-2"
    >
      <View className="w-5">
        {selected ? <Check color={colors.signal} size={18} strokeWidth={2.5} /> : null}
      </View>
      <Text
        className={
          selected
            ? 'flex-1 font-body-medium text-base text-accent'
            : 'flex-1 font-body text-base text-primary'
        }
      >
        {label}
      </Text>
      {direction ? <Text className="font-mono text-sm text-muted">{direction}</Text> : null}
    </Pressable>
  );
}

/**
 * The translation key that says which way an order runs.
 *
 * "A → Z" means nothing for a date and "newest first" means nothing for a
 * name, so the words follow the key rather than the direction alone.
 */
function directionLabel(key: string, direction: SortDirection): string {
  if (isChronological(key)) {
    return direction === 'desc' ? 'library.sort.direction.newest' : 'library.sort.direction.oldest';
  }
  return direction === 'asc' ? 'library.sort.direction.az' : 'library.sort.direction.za';
}

function absorb(): void {
  // Pressing the panel must not close the sheet behind it.
}
