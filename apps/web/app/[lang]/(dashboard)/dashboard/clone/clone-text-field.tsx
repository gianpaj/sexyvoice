import { Crown } from 'lucide-react';
import type { Dispatch } from 'react';

import { SpotlightField } from '@/components/spotlight-field';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CLONE_TEXT_MAX_LENGTH_VOXTRAL_PAID } from '@/lib/clone/constants';
import { cn } from '@/lib/utils';
import {
  type CloneDict,
  type CloneStateAction,
  formatCloneMessage,
} from './clone-state';

export function CloneTextField({
  dict,
  disabled,
  text,
  textMaxLength,
  usesVoxtral,
  userHasPaid,
  dispatch,
}: {
  dict: CloneDict;
  disabled: boolean;
  text: string;
  textMaxLength: number;
  usesVoxtral: boolean;
  userHasPaid: boolean;
  dispatch: Dispatch<CloneStateAction>;
}) {
  const textIsOverLimit = text.length > textMaxLength;
  const textLimitTooltip = formatCloneMessage(
    userHasPaid ? dict.paidTextLimitTooltip : dict.upgradeTextLimitTooltip,
    { MAX: CLONE_TEXT_MAX_LENGTH_VOXTRAL_PAID },
  );

  return (
    <>
      <div className="grid w-full gap-2">
        <Label htmlFor="text-to-convert">{dict.textToConvertLabel}</Label>
        <SpotlightField>
          <Textarea
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            data-testid="clone-text-input"
            disabled={disabled}
            id="text-to-convert"
            maxLength={textMaxLength + 30}
            onChange={(e) => {
              dispatch({
                type: 'patch',
                patch: { text: e.target.value },
              });
            }}
            placeholder={dict.textAreaPlaceholder}
            rows={5}
            value={text}
          />
        </SpotlightField>
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
          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <button
                  aria-label={textLimitTooltip}
                  className="inline-flex"
                  type="button"
                >
                  <Crown
                    className={cn(
                      'h-3.5 w-3.5 cursor-default',
                      userHasPaid
                        ? 'text-muted-foreground/50'
                        : 'text-yellow-400',
                    )}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{textLimitTooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </>
  );
}
