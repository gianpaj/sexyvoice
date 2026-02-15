'use client';

import { Pause, Play } from 'lucide-react';

import { useAudio } from '@/app/[lang]/(dashboard)/dashboard/clone/audio-provider';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface VoiceCardProps {
  voice: Voice;
  onSelect?: (voice: Voice) => void;
  isSelected?: boolean;
  playAudioTitle: string;
}

export function VoiceCard({
  voice,
  onSelect,
  isSelected,
  playAudioTitle,
}: VoiceCardProps) {
  const audio = useAudio();
  const isPlaying = audio?.isPlaying && audio?.url === voice.sample_url;

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(audio && voice.sample_url)) {
      return;
    }
    if (audio.url !== voice.sample_url) {
      audio.setUrlAndPlay(voice.sample_url);
      return;
    }

    if (audio?.isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  };

  const truncatedDescription =
    voice.sample_prompt && voice.sample_prompt.length > 70
      ? `${voice.sample_prompt.slice(0, 70)}...`
      : voice.sample_prompt;

  return (
    <TooltipProvider>
      <button
        className={cn(
          'group relative w-full cursor-pointer rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent',
          isSelected && 'border-primary bg-accent',
        )}
        onClick={() => onSelect?.(voice)}
        type="button"
      >
        <div className="flex items-start gap-3">
          {/* Play Button */}
          {voice.sample_url && (
            <Button
              className="mt-0.5 h-10 w-10 shrink-0 rounded-full"
              disabled={!audio}
              onClick={handlePlay}
              size="icon"
              title={playAudioTitle}
              variant="secondary"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h3 className="font-semibold capitalize">{voice.name}</h3>
              <span className="text-muted-foreground text-sm">
                {voice.language}
              </span>
            </div>

            {voice.sample_prompt && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="mt-1 cursor-default text-muted-foreground text-sm leading-relaxed">
                    {truncatedDescription}
                  </p>
                </TooltipTrigger>
                {voice.sample_prompt.length > 70 && (
                  <TooltipContent
                    className="max-w-xs px-3 py-2 text-sm leading-relaxed"
                    side="bottom"
                  >
                    {voice.sample_prompt}
                  </TooltipContent>
                )}
              </Tooltip>
            )}

            {/* Tags */}
            {voice.tags && voice.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {voice.tags.map((tag) => (
                  <span
                    className="rounded-md bg-muted px-2 py-0.5 text-muted-foreground text-xs"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </button>
    </TooltipProvider>
  );
}
