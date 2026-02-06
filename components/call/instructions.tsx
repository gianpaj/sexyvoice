'use client';

import { ChevronDown, ChevronRight, CircleHelp } from 'lucide-react';
import { useState } from 'react';

import { InstructionsEditor } from '@/components/call/instructions-editor';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { useConnection } from '@/hooks/use-connection';
import { usePlaygroundState } from '@/hooks/use-playground-state';

export function Instructions() {
  // const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const { pgState, helpers } = usePlaygroundState();
  const { dict } = useConnection();

  const immutablePrompt = helpers.getImmutablePrompt(pgState);

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-[4px] overflow-y-auto overflow-x-hidden rounded-lg p-4 text-neutral-300 shadow-md">
      <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center">
          <div className="mr-1 font-semibold text-xs uppercase tracking-widest">
            {dict.instructions}
          </div>
          <HoverCard open={isOpen}>
            <HoverCardTrigger asChild>
              <CircleHelp
                className="h-4 w-4 cursor-pointer"
                onClick={() => setIsOpen(!isOpen)}
              />
            </HoverCardTrigger>
            <HoverCardContent
              className="w-[260px] text-sm"
              onInteractOutside={() => setIsOpen(false)}
              side="bottom"
            >
              {dict.instructionsHelp}
              {immutablePrompt && (
                <>
                  <br />
                  <br />
                  <strong>{dict.grokImagineNote.split(':')[0]}:</strong>
                  {dict.grokImagineNote.split(':').slice(1).join(':')}
                </>
              )}
            </HoverCardContent>
          </HoverCard>
        </div>
      </div>

      <InstructionsEditor
        instructions={pgState.instructions}
        // onBlur={() => setIsFocused(false)}
        // onFocus={() => setIsFocused(true)}
      />

      {immutablePrompt && (
        <div className="mt-2">
          <button
            className="flex items-center gap-1 text-neutral-400 text-xs transition-colors hover:text-neutral-300"
            onClick={() => setIsExpanded(!isExpanded)}
            type="button"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>{dict.grokImagineIncluded}</span>
          </button>
          {isExpanded && (
            <div className="mt-2 whitespace-pre-wrap p-2 font-mono text-neutral-500 text-xs leading-loose">
              {immutablePrompt}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
