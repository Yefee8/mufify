import { CopyMinus, Equal } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { OptionList, type Option } from '@/components/ui/OptionList';
import { SettingGroup } from '@/components/ui/SettingGroup';
import { SettingRow } from '@/components/ui/SettingRow';
import { SettingSwitch } from '@/components/ui/SettingSwitch';
import { DUPLICATE_MATCHES, type DuplicateMatch } from '@/services/library/dedupeTracks';
import {
  getDuplicateSetting,
  setDuplicateMatching,
  setHideDuplicates,
} from '@/services/library/duplicateSetting';

/** `title` is taken by the group's own heading, so the mode has its own key. */
const MATCH_KEYS: Record<DuplicateMatch, 'byTitle' | 'strict'> = {
  title: 'byTitle',
  strict: 'strict',
};

/**
 * The Duplicates group: whether to hide them, and what makes two rows one song.
 *
 * A switch here and not in statistics, deliberately. Hiding a duplicate hides
 * a file the user owns, and two copies can be a CD rip and a vinyl rip somebody
 * wants side by side. Merging the spellings of one band's name has no such
 * reading, so that one is not offered as a choice — the note at the bottom
 * says so.
 *
 * The matching mode is the user's call because the two answers hide different
 * rows: by title alone, every album's "Intro" is one song; with artist and
 * length required, a live take stays beside the studio one. It is shown while
 * the switch is off too, so the choice can be read before it is turned on.
 *
 * Writes go through the store rather than storage directly: the list this
 * changes is on another tab that is already mounted and has to be told.
 */
export function DuplicateSettings() {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(() => getDuplicateSetting().hidden);
  const [match, setMatch] = useState<DuplicateMatch>(() => getDuplicateSetting().match);

  const options: Option<DuplicateMatch>[] = DUPLICATE_MATCHES.map((value) => ({
    value,
    label: t(`settings.duplicates.${MATCH_KEYS[value]}`),
    description: t(`settings.duplicates.${MATCH_KEYS[value]}Hint`),
  }));

  function onHiddenChange(next: boolean) {
    setHidden(next);
    setHideDuplicates(next);
  }

  function onMatchChange(next: DuplicateMatch) {
    setMatch(next);
    setDuplicateMatching(next);
  }

  return (
    <SettingGroup title={t('settings.duplicates.title')}>
      <SettingSwitch
        icon={CopyMinus}
        label={t('settings.duplicates.hide')}
        description={t('settings.duplicates.hideHint')}
        value={hidden}
        onChange={onHiddenChange}
      />
      <SettingRow
        icon={Equal}
        label={t('settings.duplicates.match')}
        value={t(`settings.duplicates.${MATCH_KEYS[match]}`)}
      >
        <OptionList
          options={options}
          value={match}
          onChange={onMatchChange}
          accessibilityLabel={t('settings.duplicates.match')}
        />
      </SettingRow>
      <Text className="font-body text-sm text-muted">{t('settings.duplicates.artists')}</Text>
    </SettingGroup>
  );
}
