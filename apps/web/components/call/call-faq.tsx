'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { CREDITS_PER_MINUTE } from '@/lib/supabase/constants';

interface CallFaqQuestion {
  answer: string;
  question: string;
}

export function CallFaq({
  title,
  questions,
}: {
  title: string;
  questions: CallFaqQuestion[];
}) {
  const connectionState = useConnectionState();

  // Hide the FAQ while a call is connecting or in progress.
  if (connectionState !== ConnectionState.Disconnected) {
    return null;
  }

  return (
    <section
      className="mx-auto w-full max-w-2xl px-4 pb-8"
      data-testid="call-faq"
    >
      <h2 className="mb-4 text-center font-semibold text-foreground text-lg">
        {title}
      </h2>
      <Accordion
        className="w-full rounded-md border border-border"
        collapsible
        defaultValue="item-0"
        type="single"
      >
        {questions.map((faq, i) => (
          <AccordionItem
            className="border-border px-5"
            key={i}
            value={`item-${i}`}
          >
            <AccordionTrigger className="text-foreground">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="whitespace-pre-wrap text-muted-foreground">
              {faq.answer.replaceAll('{count}', String(CREDITS_PER_MINUTE))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
