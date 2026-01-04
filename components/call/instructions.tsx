'use client';

import { ChevronDown, ChevronRight, CircleHelp } from 'lucide-react';
import { useState } from 'react';

import { InstructionsEditor } from '@/components/call/instructions-editor';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type CallLanguage, callLanguages } from '@/data/playground-state';
import { usePlaygroundState } from '@/hooks/use-playground-state';

export function Instructions() {
  // const [isFocused, setIsFocused] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const { pgState, dispatch, helpers } = usePlaygroundState();

  const immutablePrompt = helpers.getImmutablePrompt(pgState);

  const handleLanguageChange = (value: string) => {
    dispatch({ type: 'SET_LANGUAGE', payload: value as CallLanguage });
  };

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-[4px] overflow-y-auto overflow-x-hidden rounded-lg p-4 text-neutral-300 shadow-md">
      <div className="mb-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center">
          <div className="mr-1 font-semibold text-xs uppercase tracking-widest">
            INSTRUCTIONS
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
              Instructions are a system message that is prepended to the
              conversation whenever the model responds. Updates will be
              reflected on the next conversation turn.
              {immutablePrompt && (
                <>
                  <br />
                  <br />
                  <strong>Note:</strong> Grok Imagine adds additional
                  instructions for image generation.
                </>
              )}
            </HoverCardContent>
          </HoverCard>
        </div>

        <div className="flex items-center gap-2">
          <div className="font-semibold text-neutral-400 text-xs uppercase tracking-widest">
            Language
          </div>
          <Select onValueChange={handleLanguageChange} value={pgState.language}>
            <SelectTrigger className="h-9 w-[220px] border-neutral-700 bg-transparent text-neutral-200">
              <SelectValue placeholder="Choose language" />
            </SelectTrigger>
            <SelectContent className="max-h-72 overflow-y-auto border-neutral-700 bg-bg2 text-neutral-100">
              {callLanguages.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <span>Grok Imagine Instructions Included</span>
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
