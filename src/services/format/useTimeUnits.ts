import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { TimeUnitLabels } from './listeningTime';

/**
 * The one-or-two letter time units, in the reader's language.
 *
 * A hook rather than a lookup at each call site so that every screen showing a
 * listening total agrees, and so `formatListeningTime` stays a pure function
 * that can be tested without an i18n runtime.
 */
export function useTimeUnits(): TimeUnitLabels {
  const { t } = useTranslation();

  return useMemo(
    () => ({
      hour: t('common.units.hour'),
      minute: t('common.units.minute'),
      second: t('common.units.second'),
    }),
    [t],
  );
}
