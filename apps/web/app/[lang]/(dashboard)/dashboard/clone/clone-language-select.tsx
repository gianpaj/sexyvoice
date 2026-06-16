import type { Dispatch } from 'react';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CloneDict, CloneStateAction } from './clone-state';

export interface SupportedLocale {
  code: string;
  name: string;
  value: string;
}

export function CloneLanguageSelect({
  dict,
  disabled,
  selectedLocale,
  supportedLocales,
  dispatch,
}: {
  dict: CloneDict;
  disabled: boolean;
  selectedLocale: { code: string; value: string };
  supportedLocales: SupportedLocale[];
  dispatch: Dispatch<CloneStateAction>;
}) {
  return (
    <div className="grid w-full gap-2">
      <Label htmlFor="language">{dict.languageLabel}</Label>
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
          <SelectValue placeholder={dict.languageSelectPlaceholder} />
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
