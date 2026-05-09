'use client';

import { Crown, Loader2, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import type { CSSProperties, RefObject } from 'react';

import { cn } from '@/lib/utils';
import type messages from '@/messages/en.json';
import { AnimatedPromptTextarea } from './audio-generator';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

interface NonGrokPromptEditorProps {
  charactersLimit: number;
  dict: (typeof messages)['generate'];
  isEnhancingText: boolean;
  isFullscreen: boolean;
  isGenerating: boolean;
  isPaidUser: boolean;
  onEnhanceText: () => void;
  onTextChange: (text: string) => void;
  onToggleFullscreen: () => void;
  showEnhanceButton: boolean;
  text: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  textareaRightPadding: string;
  textIsOverLimit: boolean;
}

export function NonGrokPromptEditor({
  charactersLimit,
  dict,
  isEnhancingText,
  isFullscreen,
  isGenerating,
  isPaidUser,
  onEnhanceText,
  onTextChange,
  onToggleFullscreen,
  showEnhanceButton,
  text,
  textareaRef,
  textareaRightPadding,
  textIsOverLimit,
}: NonGrokPromptEditorProps) {
  return (
    <>
      <AnimatedPromptTextarea
        className={cn(
          'textarea-2 bg-transparent transition-[height] duration-200 ease-in-out',
          textareaRightPadding,
        )}
        data-testid="generate-textarea"
        maxLength={charactersLimit + 10}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={dict.textAreaPlaceholder}
        ref={textareaRef}
        style={
          {
            '--ta2-height': isFullscreen ? '30vh' : '8rem',
          } as CSSProperties
        }
        value={text}
      >
        {showEnhanceButton && (
          <Button
            className="absolute top-2 right-12 h-8 w-8 hover:bg-zinc-800"
            disabled={!text.trim() || isEnhancingText || isGenerating}
            onClick={onEnhanceText}
            size="icon"
            title="Enhance text with AI emotion tags"
            variant="ghost"
          >
            {isEnhancingText ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 text-yellow-300" />
            )}
          </Button>
        )}

        <Button
          className="absolute top-2 right-2 h-8 w-8 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          onClick={onToggleFullscreen}
          size="icon"
          title="Fullscreen"
          variant="ghost"
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      </AnimatedPromptTextarea>

      <div
        className={cn(
          'flex items-center justify-end gap-1.5 text-muted-foreground text-sm',
          textIsOverLimit ? 'font-bold text-red-500' : '',
        )}
        data-testid="generate-character-count"
      >
        {text.length} / {charactersLimit}
        <TooltipProvider>
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <Crown
                className={cn(
                  'h-3.5 w-3.5 cursor-default',
                  isPaidUser ? 'text-muted-foreground/50' : 'text-yellow-400',
                )}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {isPaidUser
                  ? 'Paid users enjoy 2× character limit'
                  : 'Upgrade to a paid plan for 2× character limit'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </>
  );
}
