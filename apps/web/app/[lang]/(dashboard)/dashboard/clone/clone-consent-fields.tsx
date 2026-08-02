'use client';

import { useTranslations } from 'next-intl';
import type { Dispatch } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { CloneStateAction } from './clone-state';

export function CloneCheckboxes({
  disabled,
  legalConsentChecked,
  usesInworld,
  referenceAudioEnhancementEnabled,
  dispatch,
  showLegalConsent = true,
}: {
  disabled: boolean;
  legalConsentChecked: boolean;
  usesInworld: boolean;
  referenceAudioEnhancementEnabled: boolean;
  dispatch: Dispatch<CloneStateAction>;
  showLegalConsent?: boolean;
}) {
  const t = useTranslations('clone');

  return (
    <>
      {!usesInworld && (
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
      )}

      {showLegalConsent && (
        <div className="flex items-start space-x-2">
          <Checkbox
            checked={legalConsentChecked}
            data-testid="clone-legal-consent"
            disabled={disabled}
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
      )}
    </>
  );
}
