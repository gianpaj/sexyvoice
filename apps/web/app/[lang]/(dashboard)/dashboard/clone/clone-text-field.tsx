'use client';

import { useTranslations } from 'next-intl';
import type { Dispatch } from 'react';

import { SpeechTextField } from '@/components/speech-text-field';
import { Label } from '@/components/ui/label';
import { RTL_CLONE_LOCALE_CODES } from '@/lib/clone/constants';
import { CLONE_PROVIDERS } from '@/lib/clone/providers';
import type { CloneStateAction } from './clone-state';

export function CloneTextField({
  disabled,
  selectedLocaleCode,
  text,
  textMaxLength,
  usesVoxtral,
  userHasPaid,
  dispatch,
}: {
  disabled: boolean;
  selectedLocaleCode: string;
  text: string;
  textMaxLength: number;
  usesVoxtral: boolean;
  userHasPaid: boolean;
  dispatch: Dispatch<CloneStateAction>;
}) {
  const t = useTranslations('clone');
  const textLimitTooltip = t(
    userHasPaid ? 'paidTextLimitTooltip' : 'upgradeTextLimitTooltip',
    { MAX: CLONE_PROVIDERS.mistral.textLimit.paid },
  );

  return (
    <div className="grid w-full gap-2">
      <Label htmlFor="text-to-convert" id="text-to-convert-label">
        {t('textToConvertLabel')}
      </Label>
      <SpeechTextField
        ariaLabelledBy="text-to-convert-label"
        dir={RTL_CLONE_LOCALE_CODES.has(selectedLocaleCode) ? 'rtl' : 'ltr'}
        disabled={disabled}
        id="text-to-convert"
        isPaidUser={userHasPaid}
        limit={textMaxLength}
        limitTooltip={usesVoxtral ? textLimitTooltip : undefined}
        onChange={(value) =>
          dispatch({ patch: { text: value }, type: 'patch' })
        }
        placeholder={t('textAreaPlaceholder')}
        provider={usesVoxtral ? 'voxtral' : undefined}
        testIds={{ count: 'clone-character-count', input: 'clone-text-input' }}
        value={text}
      />
    </div>
  );
}
