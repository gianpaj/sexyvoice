import type { Dispatch } from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import type { CloneDict, CloneStateAction } from './clone-state';

export function CloneConsentFields({
  dict,
  disabled,
  legalConsentChecked,
  referenceAudioEnhancementEnabled,
  dispatch,
}: {
  dict: CloneDict;
  disabled: boolean;
  legalConsentChecked: boolean;
  referenceAudioEnhancementEnabled: boolean;
  dispatch: Dispatch<CloneStateAction>;
}) {
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
            {dict.referenceAudioEnhancementLabel}
          </Label>
          <p className="text-muted-foreground text-xs leading-tight">
            {dict.referenceAudioEnhancementHelp}
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
          {dict.legalConsentCheckbox}
        </Label>
      </div>
    </>
  );
}
