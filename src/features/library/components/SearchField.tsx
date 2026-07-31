import { Search, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput, View } from 'react-native';

import { useThemeColors } from '@/theme/useTheme';

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Search across title, artist and album.
 *
 * Uncontrolled-feeling on purpose: the field updates on every keystroke and
 * the *query* is what waits. Debouncing the input itself makes typing feel
 * laggy, which is the mistake that gets debouncing a bad name.
 */
export function SearchField({ value, onChange }: SearchFieldProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  return (
    <View className="mx-6 mb-4 min-h-11 flex-row items-center gap-3 rounded-sm border border-subtle px-4">
      <Search color={colors.legend} size={18} strokeWidth={2} />

      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={t('library.searchPlaceholder')}
        placeholderTextColor={colors.legend}
        accessibilityLabel={t('library.search')}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        className="min-h-11 flex-1 font-body text-base text-primary"
      />

      {value.length > 0 ? (
        <Pressable
          onPress={() => onChange('')}
          accessibilityRole="button"
          accessibilityLabel={t('library.clearSearch')}
          className="min-h-11 min-w-11 items-center justify-center"
        >
          <X color={colors.legend} size={18} strokeWidth={2} />
        </Pressable>
      ) : null}
    </View>
  );
}
