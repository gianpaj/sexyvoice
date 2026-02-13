'use client';

import { Check, ClipboardCopy } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { TranscriptionResult } from '../hooks/use-transcriber';

interface Props {
  transcript: TranscriptionResult | null;
  partialTranscript: string;
  dict: (typeof langDict)['transcribe']['transcriptDisplay'];
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TranscriptDisplay({
  transcript,
  partialTranscript,
  dict,
}: Props) {
  const [copied, setCopied] = useState(false);

  const displayText = transcript?.text || partialTranscript;

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

      <div className="max-h-96 overflow-y-auto rounded-xl border border-border bg-muted/20 p-4">
        {transcript?.chunks?.length ? (
          <div className="space-y-2">
            {transcript.chunks.map((chunk) => (
              <div className="flex gap-3" key={chunk.timestamp[0]}>
                <span className="shrink-0 font-mono text-muted-foreground text-xs">
                  {formatTimestamp(chunk.timestamp[0])}
                </span>
                <p className="text-foreground text-sm">{chunk.text.trim()}</p>
              </div>
            ))}
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
