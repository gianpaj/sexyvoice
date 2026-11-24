'use client';

import { ArrowUp, Mic, MicOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Ref } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface VoiceChatComposerProps {
  draft: string;
  inCall?: boolean;
  inputRef?: Ref<HTMLTextAreaElement>;
  microphone?: { disabled: boolean; muted: boolean; onToggle: () => void };
  onDraft: (text: string) => void;
  onSend: () => void;
  placeholder: string;
  sendDisabled: boolean;
}

// Text-only Prompt Input using the shadcn Input Group pattern.
export function VoiceChatComposer({
  draft,
  inCall,
  inputRef,
  microphone,
  onDraft,
  onSend,
  placeholder,
  sendDisabled,
}: VoiceChatComposerProps) {
  const t = useTranslations('voiceChat');
  const canSend = !sendDisabled && Boolean(draft.trim());

  return (
    <form
      className={cn(
        'flex shrink-0 items-end gap-2',
        inCall
          ? 'border-[#242c52] border-t bg-[#0d1430] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'
          : 'rounded-3xl border border-input bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring',
      )}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSend();
      }}
    >
      {microphone && (
        <Button
          aria-label={t(microphone.muted ? 'unmute' : 'mute')}
          className="size-11 shrink-0 rounded-full border-[#242c52] bg-[#161d3b] text-slate-100"
          disabled={microphone.disabled}
          onClick={microphone.onToggle}
          onPointerDown={(event) => event.preventDefault()}
          size="icon"
          type="button"
          variant="outline"
        >
          {microphone.muted ? (
            <MicOff aria-hidden="true" />
          ) : (
            <Mic aria-hidden="true" />
          )}
        </Button>
      )}
      <Textarea
        aria-label={t('message')}
        className={cn(
          'field-sizing-content max-h-36 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto px-3 py-2.5 text-base leading-6 focus-visible:ring-offset-0',
          inCall
            ? 'rounded-3xl border-[#242c52] bg-[#161d3b] placeholder:text-slate-400 focus-visible:ring-violet-400'
            : 'border-0 bg-transparent focus-visible:ring-0',
        )}
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
        className={cn(
          'size-11 shrink-0 rounded-full',
          inCall &&
            'bg-[#4c41a0] text-white hover:bg-[#5b50b1] disabled:bg-[#242c52]!',
        )}
        disabled={!canSend}
        size="icon"
        type="submit"
      >
        <ArrowUp aria-hidden="true" />
      </Button>
    </form>
  );
}
