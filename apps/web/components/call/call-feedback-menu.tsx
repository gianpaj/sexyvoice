'use client';

import { ChevronDown, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { useFeedback } from '@/hooks/use-feedback';
import {
  CALL_FEEDBACK_REASONS,
  FEEDBACK_NOTE_MAX_LENGTH,
} from '@/lib/feedback';

export function CallFeedbackMenu({ roomName }: { roomName: string }) {
  const t = useTranslations('feedback');
  const trigger = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] =
    useState<(typeof CALL_FEEDBACK_REASONS)[number]>();
  const [note, setNote] = useState('');
  const { clearError, error, pending, rating, submit } = useFeedback({
    kind: 'call',
    roomName,
  });
  const errorMessage = error ? (
    <p className="text-destructive text-sm" role="alert">
      {t(error)}
    </p>
  ) : null;

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            className="min-h-11"
            ref={trigger}
            type="button"
            variant="ghost"
          >
            {t('rateCall')}
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          onCloseAutoFocus={(event) => {
            if (open) event.preventDefault();
          }}
        >
          <DropdownMenuItem
            className="min-h-11"
            disabled={pending}
            onSelect={() => submit({ rating: 'up' })}
          >
            <ThumbsUp aria-hidden="true" />
            {t('goodCall')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="min-h-11"
            disabled={pending}
            onSelect={() => {
              clearError();
              setOpen(true);
            }}
          >
            <ThumbsDown aria-hidden="true" />
            {t('leaveFeedback')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div
        aria-live="polite"
        className="text-muted-foreground text-sm empty:hidden"
      >
        {rating && !error ? t('thanks') : null}
      </div>
      {open ? null : errorMessage}

      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent
          aria-describedby={undefined}
          className="max-sm:data-open:zoom-in-100 max-sm:data-closed:zoom-out-100 max-h-[85dvh] overflow-y-auto max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
          showCloseButton={false}
        >
          <DialogTitle className="pr-12">{t('whatWentWrong')}</DialogTitle>
          <DialogClose asChild>
            <Button
              aria-label={t('close')}
              className="absolute top-1 right-1 size-11"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
          <form
            className="grid gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!reasonCode) return;
              const saved = await submit({
                note: reasonCode === 'other' ? note : undefined,
                rating: 'down',
                reasonCode,
              });
              if (saved) {
                setOpen(false);
                setReasonCode(undefined);
                setNote('');
              }
            }}
          >
            <fieldset className="grid gap-1.5" disabled={pending}>
              <legend className="sr-only">{t('whatWentWrong')}</legend>
              {CALL_FEEDBACK_REASONS.map((reason) => (
                <label key={reason}>
                  <input
                    checked={reasonCode === reason}
                    className="peer sr-only"
                    name={formId}
                    onChange={() => setReasonCode(reason)}
                    type="radio"
                    value={reason}
                  />
                  <span className="flex min-h-11 cursor-pointer items-center rounded-md border border-transparent bg-muted/60 px-3 hover:bg-muted peer-checked:border-primary/50 peer-checked:bg-primary/10 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                    {t(`reasons.${reason}`)}
                  </span>
                </label>
              ))}
              {reasonCode === 'other' && (
                <Textarea
                  aria-label={t('optionalNote')}
                  maxLength={FEEDBACK_NOTE_MAX_LENGTH}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t('optionalNote')}
                  value={note}
                />
              )}
            </fieldset>
            {errorMessage}
            <Button disabled={!reasonCode || pending} type="submit">
              {t('sendFeedback')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
