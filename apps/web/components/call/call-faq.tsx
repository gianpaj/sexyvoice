'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';

import { CREDITS_PER_MINUTE } from '@/lib/supabase/constants';

interface CallFaqQuestion {
  question: string;
  answer: string;
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
      <dl className="flex flex-col gap-3">
        {questions.map((faq, i) => (
          <div
            className="rounded-md border border-gray-500 bg-accent px-5 py-4"
            key={i}
          >
            <dt className="font-medium text-foreground text-sm">
              {faq.question}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">
              {faq.answer.replace('{count}', String(CREDITS_PER_MINUTE))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
