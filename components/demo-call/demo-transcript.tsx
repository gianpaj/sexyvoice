'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

import type { DemoTranscriptSegment } from '@/data/demo-transcripts';
import { cn } from '@/lib/utils';

interface DemoTranscriptProps {
  segments: DemoTranscriptSegment[];
  currentTime: number;
  characterName: string;
}

export function DemoTranscript({
  segments,
  currentTime,
  characterName,
}: DemoTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleSegments = segments.filter((s) => s.time <= currentTime);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleSegments.length]);

  return (
    <div className="flex h-32 flex-col gap-2 overflow-y-auto px-2 py-1">
      <AnimatePresence>
        {visibleSegments.map((segment, i) => (
          <motion.div
            key={`${segment.speaker}-${segment.time}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={cn(
              'flex',
              segment.speaker === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[80%] rounded-lg px-3 py-1.5 text-sm',
                segment.speaker === 'agent'
                  ? 'bg-muted text-foreground'
                  : 'bg-violet-600/30 text-foreground',
              )}
            >
              <span className="mb-0.5 block font-medium text-[10px] text-muted-foreground">
                {segment.speaker === 'agent' ? characterName : 'You'}
              </span>
              {segment.text}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={scrollRef} />
    </div>
  );
}
