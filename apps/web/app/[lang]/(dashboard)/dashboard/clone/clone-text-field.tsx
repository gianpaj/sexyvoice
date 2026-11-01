'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { Dispatch } from 'react';

import { SpotlightField } from '@/components/spotlight-field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UpgradeCrown } from '@/components/upgrade-crown';
import {
  CLONE_TEXT_MAX_LENGTH_VOXTRAL_PAID,
  RTL_CLONE_LOCALE_CODES,
} from '@/lib/clone/constants';
import { formatCloneMessage } from '@/lib/clone/error-message';
import { CHARACTERS_LIMIT_GRACE } from '@/lib/ui-constants';
import { cn } from '@/lib/utils';
import type { CloneStateAction } from './clone-state';

const TTSEditor = dynamic(
  () => import('@/components/tts-editor').then((module) => module.TTSEditor),
  { ssr: false },
);

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
  const textIsOverLimit = text.length > textMaxLength;
  const textLimitTooltip = formatCloneMessage(
    userHasPaid ? t('paidTextLimitTooltip') : t('upgradeTextLimitTooltip'),
    { MAX: CLONE_TEXT_MAX_LENGTH_VOXTRAL_PAID },
  );

  return (
    <>
      <div className="grid w-full gap-2">
        <Label htmlFor="text-to-convert" id="text-to-convert-label">
          {t('textToConvertLabel')}
        </Label>
        {usesVoxtral ? (
          <TTSEditor
            ariaLabelledBy="text-to-convert-label"
            charactersLimit={textMaxLength}
            dir={RTL_CLONE_LOCALE_CODES.has(selectedLocaleCode) ? 'rtl' : 'ltr'}
            disabled={disabled}
            id="text-to-convert"
            onChange={(value) =>
              dispatch({ patch: { text: value }, type: 'patch' })
            }
            placeholder={t('textAreaPlaceholder')}
            provider="voxtral"
            showCharacterCount={false}
            testId="clone-text-input"
            value={text}
          />
        ) : (
          <SpotlightField>
            <Textarea
              className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              data-testid="clone-text-input"
              dir={
                RTL_CLONE_LOCALE_CODES.has(selectedLocaleCode) ? 'rtl' : 'ltr'
              }
              disabled={disabled}
              id="text-to-convert"
              maxLength={textMaxLength + CHARACTERS_LIMIT_GRACE}
              onChange={(e) => {
                dispatch({
                  patch: { text: e.target.value },
                  type: 'patch',
                });
              }}
              placeholder={t('textAreaPlaceholder')}
              rows={5}
              value={text}
            />
          </SpotlightField>
        )}
      </div>
      <div
        className={cn(
          '-mt-2 flex items-center justify-end gap-1.5 text-right text-muted-foreground text-sm',
          [textIsOverLimit ? 'font-bold text-red-500' : ''],
        )}
        data-testid="clone-character-count"
      >
        <span>
          {text.length} / {textMaxLength}
        </span>
        {usesVoxtral && (
          <UpgradeCrown paid={userHasPaid} tooltip={textLimitTooltip} />
        )}
      </div>
    </>
  );
}
