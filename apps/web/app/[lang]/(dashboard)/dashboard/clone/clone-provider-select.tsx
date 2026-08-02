'use client';

import { useTranslations } from 'next-intl';
import type { Dispatch } from 'react';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CloneProviderSelection, CloneStateAction } from './clone-state';

const PROVIDER_OPTIONS: {
  value: CloneProviderSelection;
  labelKey:
    | 'providerAuto'
    | 'providerReplicate'
    | 'providerMistral'
    | 'providerInworld';
}[] = [
  { value: 'auto', labelKey: 'providerAuto' },
  { value: 'replicate', labelKey: 'providerReplicate' },
  { value: 'mistral', labelKey: 'providerMistral' },
  { value: 'inworld', labelKey: 'providerInworld' },
];

export function CloneProviderSelect({
  disabled,
  selectedProvider,
  dispatch,
}: {
  disabled: boolean;
  selectedProvider: CloneProviderSelection;
  dispatch: Dispatch<CloneStateAction>;
}) {
  const t = useTranslations('clone');

  return (
    <div className="grid w-full gap-2">
      <Label htmlFor="provider">{t('providerLabel')}</Label>
      <Select
        disabled={disabled}
        onValueChange={(value) =>
          dispatch({
            type: 'patch',
            patch: {
              selectedProvider: value as CloneProviderSelection,
            },
          })
        }
        value={selectedProvider}
      >
        <SelectTrigger
          className="w-40"
          data-testid="clone-provider-select"
          id="provider"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROVIDER_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {t(option.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
