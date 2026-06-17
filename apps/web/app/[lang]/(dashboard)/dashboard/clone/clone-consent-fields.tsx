'use client';

import { useTranslations } from 'next-intl';
import type { Dispatch } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { CloneStateAction } from './clone-state';

export function CloneConsentFields({
  disabled,
  legalConsentChecked,
  referenceAudioEnhancementEnabled,
  dispatch,
}: {
  disabled: boolean;
  legalConsentChecked: boolean;
  referenceAudioEnhancementEnabled: boolean;
  dispatch: Dispatch<CloneStateAction>;
}) {
  const t = useTranslations('clone');

  return (
    <>
      <div className="flex items-start space-x-2">
        <Checkbox
          checked={referenceAudioEnhancementEnabled}
          disabled={disabled}
          id="reference-audio-enhancement"
          onCheckedChange={(checked) => {
            dispatch({
              type: 'patch',
              patch: {
                referenceAudioEnhancementEnabled: checked === true,
              },
            });
          }}
        />
        <div className="grid gap-1">
          <Label
            className="font-normal text-muted-foreground text-sm leading-tight"
            htmlFor="reference-audio-enhancement"
          >
            {t('referenceAudioEnhancementLabel')}
          </Label>
          <p className="text-muted-foreground text-xs leading-tight">
            {t('referenceAudioEnhancementHelp')}
          </p>
        </div>
      </div>

      <div className="flex items-start space-x-2">
        <Checkbox
          checked={legalConsentChecked}
          data-testid="clone-legal-consent"
          id="legal-consent"
          onCheckedChange={(checked) => {
            dispatch({
              type: 'patch',
              patch: { legalConsentChecked: checked === true },
            });
          }}
        />
        <Label
          className="font-normal text-muted-foreground text-sm leading-tight"
          data-testid="clone-legal-consent-label"
          htmlFor="legal-consent"
        >
          {t('legalConsentCheckbox')}
        </Label>
      </div>
    </>
  );
}
