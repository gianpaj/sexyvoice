'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ExpandableTextarea } from '@/components/expandable-textarea';
import { SpotlightField } from '@/components/spotlight-field';
import { TTSEditor } from '@/components/tts-editor';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { UpgradeCrown } from '@/components/upgrade-crown';
import type { TtsEditorProvider } from '@/lib/tts-editor';
import { CHARACTERS_LIMIT_GRACE } from '@/lib/ui-constants';
import { cn } from '@/lib/utils';

const BORDERLESS_TEXTAREA =
  'border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0';

interface CharacterCountProps {
  count: number;
  /** Shown instead of the count, such as the split summary. */
  countLabel?: string;
  enforceLimit: boolean;
  isPaidUser: boolean;
  limit: number;
  limitTooltip?: string;
  testId: string;
}

function CharacterCount({
  count,
  countLabel,
  enforceLimit,
  isPaidUser,
  limit,
  limitTooltip,
  testId,
}: CharacterCountProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-1.5 text-muted-foreground text-sm tabular-nums',
        enforceLimit && count > limit && 'text-red-500',
      )}
      data-testid={testId}
    >
      {countLabel ?? (
        <>
          {enforceLimit ? `${count} / ${limit}` : count}
          {limitTooltip && (
            <UpgradeCrown paid={isPaidUser} tooltip={limitTooltip} />
          )}
        </>
      )}
    </div>
  );
}

interface SpeechTextFieldProps {
  ariaLabelledBy?: string;
  countLabel?: string;
  dir?: 'ltr' | 'rtl';
  disabled?: boolean;
  /** Typing stops a grace past the limit and the count turns red over it. */
  enforceLimit?: boolean;
  /** Shows the Improve text button. */
  enhance?: { disabled: boolean; isEnhancing: boolean; onEnhance: () => void };
  /** Grows with the text and can expand; otherwise five rows. */
  expandable?: boolean;
  id?: string;
  isPaidUser: boolean;
  limit: number;
  /** Upgrade crown tooltip; no crown without one. */
  limitTooltip?: string;
  onChange: (text: string) => void;
  placeholder: string;
  /** Tag catalog for the tag editor; a plain textarea without one. */
  provider?: TtsEditorProvider;
  testIds: { count: string; input: string };
  value: string;
}

/** The speech text field of the generate and clone pages, with its count. */
export function SpeechTextField({
  ariaLabelledBy,
  countLabel,
  dir,
  disabled,
  enhance,
  enforceLimit = true,
  expandable = false,
  id,
  isPaidUser,
  limit,
  limitTooltip,
  onChange,
  placeholder,
  provider,
  testIds,
  value,
}: SpeechTextFieldProps) {
  const t = useTranslations('generate');
  const count = (
    <CharacterCount
      count={value.length}
      countLabel={countLabel}
      enforceLimit={enforceLimit}
      isPaidUser={isPaidUser}
      limit={limit}
      limitTooltip={limitTooltip}
      testId={testIds.count}
    />
  );

  if (provider) {
    return (
      <TTSEditor
        ariaLabelledBy={ariaLabelledBy}
        charactersLimit={limit}
        dir={dir}
        disabled={disabled}
        enforceCharactersLimit={enforceLimit}
        id={id}
        onChange={onChange}
        placeholder={placeholder}
        provider={provider}
        testId={testIds.input}
        toolbarEnd={count}
        value={value}
      />
    );
  }

  const textareaProps = {
    'aria-labelledby': ariaLabelledBy,
    'data-testid': testIds.input,
    dir,
    disabled,
    id,
    maxLength: enforceLimit ? limit + CHARACTERS_LIMIT_GRACE : undefined,
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) =>
      onChange(event.target.value),
    placeholder,
    value,
  };

  return (
    <>
      <SpotlightField>
        {expandable ? (
          <ExpandableTextarea
            className={cn(BORDERLESS_TEXTAREA, enhance ? 'pr-20' : 'pr-10')}
            compactHeight="8rem"
            minRows={6}
            {...textareaProps}
          >
            {enhance && (
              <Button
                className="absolute top-2 right-12 h-8 w-8 hover:bg-zinc-800"
                disabled={
                  !value.trim() || enhance.isEnhancing || enhance.disabled
                }
                onClick={enhance.onEnhance}
                size="icon"
                title={t('enhanceTextTitle')}
                variant="ghost"
              >
                {enhance.isEnhancing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 text-yellow-300" />
                )}
              </Button>
            )}
          </ExpandableTextarea>
        ) : (
          <Textarea
            className={BORDERLESS_TEXTAREA}
            rows={5}
            {...textareaProps}
          />
        )}
      </SpotlightField>
      {count}
    </>
  );
}
