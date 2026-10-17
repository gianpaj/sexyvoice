'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { useMessages } from 'next-intl';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { CREDITS_PER_MINUTE } from '@/lib/supabase/constants';

export function CallFaq() {
  const connectionState = useConnectionState();
  const messages = useMessages();
  const callFaq = messages.landing?.faq?.groups?.find(
    (group) => group.id === 'liveCalling',
  );

  // Hide the FAQ while a call is connecting or in progress.
  if (connectionState !== ConnectionState.Disconnected || !callFaq) {
    return null;
  }

  return (
    <section
      className="mx-auto w-full max-w-2xl px-4 pb-8"
      data-testid="call-faq"
    >
      <h2 className="mb-4 text-center font-semibold text-foreground text-lg">
        {callFaq.category}
      </h2>
      <Accordion
        className="w-full rounded-md border border-border"
        collapsible
        defaultValue="item-0"
        type="single"
      >
        {callFaq.questions.map((faq, i) => (
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
