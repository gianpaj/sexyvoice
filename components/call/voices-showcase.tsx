'use client';

import { Check, Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { type VoiceId, voices } from '@/data/voices';
import { cn } from '@/lib/utils';

interface VoicesShowcaseProps {
  onSelectVoice?: (voiceId: VoiceId) => void;
  currentVoice?: VoiceId;
  onOpenChange?: (open: boolean) => void;
}

function VoiceCardPlayButton({
  audioUrl,
  voiceName,
}: {
  audioUrl: string;
  voiceName: string;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onerror = () => setIsPlaying(false);
    }

    if (isPlaying) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    } else {
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  useEffect(
    () => () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    },
    [],
  );

  return (
    <button
      aria-label={isPlaying ? 'Stop voice sample' : 'Play voice sample'}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg3 transition-colors hover:bg-bg2 focus:outline-none focus:ring-2 focus:ring-primary/50"
      onClick={handlePlay}
      title={`Preview ${voiceName}'s voice`}
      type="button"
    >
      {isPlaying ? (
        <svg
          className="text-fg0"
          fill="currentColor"
          height="12"
          viewBox="0 0 14 14"
          width="12"
        >
          <rect height="10" rx="0.5" width="3" x="3" y="2" />
          <rect height="10" rx="0.5" width="3" x="8" y="2" />
        </svg>
      ) : (
        <svg
          className="text-fg0"
          fill="currentColor"
          height="12"
          viewBox="0 0 14 14"
          width="12"
        >
          <path d="M3 2.5v9a.5.5 0 00.75.43l7.5-4.5a.5.5 0 000-.86l-7.5-4.5A.5.5 0 003 2.5z" />
        </svg>
      )}
    </button>
  );
}

export function VoicesShowcase({
  onSelectVoice,
  currentVoice,
  onOpenChange,
}: VoicesShowcaseProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    onOpenChange?.(newOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button
          aria-label="View all voices"
          className="h-8 w-8"
          size="icon"
          variant="ghost"
        >
          <Info className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col p-0 sm:max-w-4xl">
        <div className="border-separator1 border-b px-6 py-5">
          <DialogHeader>
            <DialogTitle className="font-semibold text-2xl text-fg0">
              Available Voices
            </DialogTitle>
            <DialogDescription className="mt-2 text-base text-fg1">
              Choose from {voices.length} unique voice options for your AI
              agent.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {voices.map((voice) => {
              const isSelected = currentVoice === voice.id;
              return (
                <button
                  className={cn(
                    'flex flex-col gap-3 rounded-lg border p-4 text-left transition-all',
                    isSelected
                      ? 'border-fgAccent1 bg-bg2 ring-2 ring-fgAccent1/20'
                      : 'border-separator1 bg-bg0 hover:border-fg3 hover:bg-bg2',
                  )}
                  key={voice.id}
                  onClick={() => {
                    onSelectVoice?.(voice.id);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-base text-fg0">
                          {voice.name}
                        </h3>
                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0 text-fgAccent1" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="text-xs" variant="secondary">
                          {voice.type}
                        </Badge>
                        <span className="text-fg2 text-xs">{voice.tone}</span>
                      </div>
                    </div>
                    <VoiceCardPlayButton
                      audioUrl={voice.audioSampleUrl}
                      voiceName={voice.name}
                    />
                  </div>
                  <p className="text-fg1 text-sm">{voice.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/*<div className="border-separator1 border-t bg-bg1 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-fg2 text-sm">
              Learn more about available voices
            </p>
            <Button
              leftIcon={<ExternalLink />}
              onClick={() =>
                window.open(
                  'https://docs.x.ai/docs/guides/voice',
                  '_blank',
                  'noopener,noreferrer',
                )
              }
              size="sm"
              // variant="primary"
            >
              Voice Documentation
            </Button>
          </div>
        </div>*/}
      </DialogContent>
    </Dialog>
  );
}
