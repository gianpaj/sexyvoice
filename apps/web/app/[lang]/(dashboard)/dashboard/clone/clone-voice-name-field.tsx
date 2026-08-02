'use client';

import { useTranslations } from 'next-intl';
import type { Dispatch } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CloneStateAction } from './clone-state';

export function CloneVoiceNameField({
  disabled,
  dispatch,
  voiceName,
}: {
  disabled: boolean;
  dispatch: Dispatch<CloneStateAction>;
  voiceName: string;
}) {
  const t = useTranslations('clone');

  return (
    <div className="grid w-full gap-2">
      <Label htmlFor="voice-name">{t('voiceNameLabel')}</Label>
      <Input
        disabled={disabled}
        id="voice-name"
        maxLength={60}
        onChange={(event) =>
          dispatch({
            type: 'patch',
            patch: { voiceName: event.target.value },
          })
        }
        placeholder={t('voiceNamePlaceholder')}
        value={voiceName}
      />
    </div>
  );
}
