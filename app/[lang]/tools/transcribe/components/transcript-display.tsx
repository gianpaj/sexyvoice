'use client';

import { Check, ClipboardCopy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import { cn } from '@/lib/utils';
import type { TranscriptionResult } from '../hooks/use-transcriber';

interface Props {
  transcript: TranscriptionResult | null;
  partialTranscript: string;
  currentTime?: number | null;
  dict: (typeof langDict)['transcribe']['transcriptDisplay'];
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function findActiveChunkIndex(
  chunks: TranscriptionResult['chunks'],
  currentTime: number,
): number {
  if (!chunks?.length) return -1;

  for (let i = chunks.length - 1; i >= 0; i--) {
    const [start] = chunks[i].timestamp;
    if (currentTime >= start) {
      return i;
    }
  }
  return -1;
}

export function TranscriptDisplay({
  transcript,
  partialTranscript,
  currentTime,
  dict,
}: Props) {
  const [copied, setCopied] = useState(false);
  const activeChunkRef = useRef<HTMLDivElement | null>(null);

  const displayText = transcript?.text || partialTranscript;

  const activeChunkIndex =
    currentTime != null && transcript?.chunks?.length
      ? findActiveChunkIndex(transcript.chunks, currentTime)
      : -1;

  // biome-ignore lint/correctness/useExhaustiveDependencies: we scroll when activeChunkIndex changes
  useEffect(() => {
    if (activeChunkRef.current) {
      activeChunkRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [activeChunkIndex]);

  const handleCopy = useCallback(async () => {
    if (!displayText) return;
    await navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [displayText]);

  if (!displayText) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">{dict.title}</h3>
        <Button
          className="gap-1.5"
          onClick={handleCopy}
          size="sm"
          variant="ghost"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              {dict.copied}
            </>
          ) : (
            <>
              <ClipboardCopy className="h-3.5 w-3.5" />
              {dict.copy}
            </>
          )}
        </Button>
      </div>

      <div className="max-h-96 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2 md:p-4">
        {transcript?.chunks?.length ? (
          <div className="space-y-1">
            {transcript.chunks.map((chunk, index) => {
              const isActive = index === activeChunkIndex;
              return (
                <div
                  className={cn(
                    'flex items-center gap-3 rounded-md px-2 py-1 transition-colors duration-200',
                    isActive && 'bg-primary/30',
                  )}
                  key={chunk.timestamp[0]}
                  ref={isActive ? activeChunkRef : null}
                >
                  <span
                    className={cn(
                      'shrink-0 font-mono text-xs',
                      isActive ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {formatTimestamp(chunk.timestamp[0])}
                  </span>
                  <p
                    className={cn(
                      'text-sm transition-colors duration-200',
                      isActive
                        ? 'font-medium text-foreground'
                        : 'text-foreground',
                    )}
                  >
                    {chunk.text.trim()}
                  </p>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-foreground text-sm">
            {displayText}
          </p>
        )}
      </div>
    </div>
  );
}
