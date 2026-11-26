'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useFeedback } from '@/hooks/use-feedback';
import type { FeedbackRating } from '@/lib/feedback';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

const ratings = [
  { Icon: ThumbsUp, label: 'goodAudio', value: 'up' },
  { Icon: ThumbsDown, label: 'badAudio', value: 'down' },
] as const;

export function AudioFeedback({ audioFileId }: { audioFileId: string }) {
  const t = useTranslations('feedback');
  const { error, pending, rating, submit } = useFeedback({
    kind: 'audio',
    audioFileId,
  });
  const [savedRating, setSavedRating] = useState<FeedbackRating>();

  useEffect(() => {
    const controller = new AbortController();

    async function restoreRating() {
      const { data } = await getSupabaseBrowserClient()
        .from('feedback')
        .select('rating')
        .eq('audio_file_id', audioFileId)
        .abortSignal(controller.signal)
        .maybeSingle();
      const stored = data?.rating;
      if (
        !controller.signal.aborted &&
        (stored === 'up' || stored === 'down')
      ) {
        setSavedRating(stored);
      }
    }

    restoreRating().catch(() => undefined);
    return () => controller.abort();
  }, [audioFileId]);

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {ratings.map(({ Icon, label, value }) => (
          <Button
            aria-disabled={pending}
            aria-label={t(label)}
            aria-pressed={(rating ?? savedRating) === value}
            className="size-11 text-muted-foreground aria-pressed:bg-blue-500/10 aria-pressed:text-blue-600 dark:aria-pressed:text-blue-400"
            key={value}
            onClick={() => submit({ rating: value })}
            size="icon"
            title={t(label)}
            type="button"
            variant="ghost"
          >
            <Icon aria-hidden="true" />
          </Button>
        ))}
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}
