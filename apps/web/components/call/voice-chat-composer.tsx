'use client';

import { ArrowUp, Mic, Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Ref } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface VoiceChatComposerProps {
  draft: string;
  inputRef?: Ref<HTMLTextAreaElement>;
  onBackToVoice?: () => void;
  onDraft: (text: string) => void;
  onSend: () => void;
  placeholder: string;
  sendDisabled: boolean;
  speakerOff?: boolean;
  switchingMode?: boolean;
}

// Text-only Prompt Input using the shadcn Input Group pattern.
export function VoiceChatComposer({
  draft,
  inputRef,
  onBackToVoice,
  switchingMode,
  onDraft,
  onSend,
  placeholder,
  sendDisabled,
  speakerOff,
}: VoiceChatComposerProps) {
  const t = useTranslations('voiceChat');
  const canSend = !sendDisabled && Boolean(draft.trim());

  return (
    <form
      className="flex shrink-0 items-end gap-2 rounded-3xl border border-input bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      {onBackToVoice && (
        <Button
          aria-label={t(speakerOff ? 'speakerOn' : 'backToVoice')}
          className="size-11 shrink-0 rounded-full"
          disabled={switchingMode}
          onClick={onBackToVoice}
          size="icon"
          type="button"
          variant="outline"
        >
          {speakerOff ? (
            <Volume2 aria-hidden="true" />
          ) : (
            <Mic aria-hidden="true" />
          )}
        </Button>
      )}
      <Textarea
        aria-label={t('message')}
        className="field-sizing-content max-h-36 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-3 py-2.5 text-base leading-6 focus-visible:ring-0 focus-visible:ring-offset-0"
        maxLength={2000}
        onChange={(event) => onDraft(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={placeholder}
        ref={inputRef}
        rows={1}
        value={draft}
      />
      <Button
        aria-label={t('send')}
        className="size-11 shrink-0 rounded-full"
        disabled={!canSend}
        size="icon"
        type="submit"
      >
        <ArrowUp aria-hidden="true" />
      </Button>
    </form>
  );
}
