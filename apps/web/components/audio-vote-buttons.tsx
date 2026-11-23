'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { toast } from '@/components/services/toast';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type Vote = 'down' | 'up';

async function postVote(audioUrl: string, vote: Vote | null) {
  const response = await fetch('/api/audio-vote', {
    body: JSON.stringify({ audioUrl, vote }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Vote failed (${response.status})`);
  }
}

function VoteButton({
  disabled,
  icon: Icon,
  isActive,
  label,
  onClick,
}: {
  disabled: boolean;
  icon: typeof ThumbsUp;
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <Button
            aria-label={label}
            aria-pressed={isActive}
            disabled={disabled}
            onClick={onClick}
            size="icon"
            variant="secondary"
          >
            <Icon
              className={cn(
                'size-6',
                isActive && 'fill-blue-400/25 text-blue-400',
              )}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Thumbs up/down on a generated audio file. Works for both voice generation
 * and voice cloning results: both APIs return the uploaded file's public
 * `url`, which is all `/api/audio-vote` needs to find its `audio_files` row.
 * Mounting loads any stored vote via GET so a revisited result keeps its
 * selection.
 */
export function AudioVoteButtons({ audioUrl }: { audioUrl: string }) {
  const t = useTranslations('audioVote');
  const [vote, setVote] = useState<Vote | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/audio-vote?audioUrl=${encodeURIComponent(audioUrl)}`)
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { vote?: unknown };
        if (body.vote === 'up' || body.vote === 'down') {
          setVote(body.vote);
        }
      })
      .catch(() => {
        // A missing stored vote just leaves both buttons unselected.
      });

    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  const handleVote = async (target: Vote) => {
    if (isSubmitting) return;

    const previousVote = vote;
    const nextVote = previousVote === target ? null : target;
    setIsSubmitting(true);
    setVote(nextVote);

    try {
      await postVote(audioUrl, nextVote);
    } catch {
      setVote(previousVote);
      toast.error(t('error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <VoteButton
        disabled={isSubmitting}
        icon={ThumbsUp}
        isActive={vote === 'up'}
        label={t('upvote')}
        onClick={() => handleVote('up')}
      />
      <VoteButton
        disabled={isSubmitting}
        icon={ThumbsDown}
        isActive={vote === 'down'}
        label={t('downvote')}
        onClick={() => handleVote('down')}
      />
    </div>
  );
}
