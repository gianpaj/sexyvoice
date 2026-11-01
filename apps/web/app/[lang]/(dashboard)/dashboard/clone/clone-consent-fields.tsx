'use client';

import { useTranslations } from 'next-intl';
import type { Dispatch } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { CloneStateAction } from './clone-state';

/**
 * `paid`: Replicate cleanup, charged in credits. `inworld`: Inworld's free
 * noise removal when saving a call voice.
 */
export type ReferenceCleanup = 'paid' | 'inworld' | 'none';

export function CloneConsentFields({
  cleanup,
  disabled,
  legalConsentChecked,
  referenceAudioEnhancementEnabled,
  dispatch,
}: {
  cleanup: ReferenceCleanup;
  disabled: boolean;
  legalConsentChecked: boolean;
  referenceAudioEnhancementEnabled: boolean;
  dispatch: Dispatch<CloneStateAction>;
}) {
  const t = useTranslations('clone');

  return (
    <>
      {cleanup !== 'none' && (
        <div className="flex items-start space-x-2">
          <Checkbox
            checked={referenceAudioEnhancementEnabled}
            disabled={disabled}
            id="reference-audio-enhancement"
            onCheckedChange={(checked) => {
              dispatch({
                patch: {
                  referenceAudioEnhancementEnabled: checked === true,
                },
                type: 'patch',
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
              {t(
                cleanup === 'inworld'
                  ? 'savedVoice.noiseRemovalHelp'
                  : 'referenceAudioEnhancementHelp',
              )}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start space-x-2">
        <Checkbox
          checked={legalConsentChecked}
          data-testid="clone-legal-consent"
          disabled={disabled}
          id="legal-consent"
          onCheckedChange={(checked) => {
            dispatch({
              patch: { legalConsentChecked: checked === true },
              type: 'patch',
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
