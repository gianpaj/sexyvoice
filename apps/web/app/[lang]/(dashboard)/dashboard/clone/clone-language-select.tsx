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
import type { CloneStateAction } from './clone-state';

export interface SupportedLocale {
  code: string;
  name: string;
  value: string;
}

export function CloneLanguageSelect({
  disabled,
  selectedLocale,
  supportedLocales,
  dispatch,
}: {
  disabled: boolean;
  selectedLocale: { code: string; value: string };
  supportedLocales: SupportedLocale[];
  dispatch: Dispatch<CloneStateAction>;
}) {
  const t = useTranslations('clone');

  return (
    <div className="grid w-full gap-2">
      <Label htmlFor="language">{t('languageLabel')}</Label>
      <Select
        disabled={disabled}
        onValueChange={(code) =>
          dispatch({
            type: 'patch',
            patch: {
              selectedLocale: {
                code,
                value:
                  supportedLocales.find((c) => c.code === code)?.value || '',
              },
            },
          })
        }
        value={selectedLocale.code}
      >
        <SelectTrigger
          className="w-32"
          data-testid="clone-language-select"
          id="language"
        >
          <SelectValue placeholder={t('languageSelectPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {supportedLocales.map((locale) => (
            <SelectItem key={locale.code} value={locale.code}>
              {locale.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
