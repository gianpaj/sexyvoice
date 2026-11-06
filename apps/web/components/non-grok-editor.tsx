'use client';

import { Loader2, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CSSProperties, ReactNode, RefObject } from 'react';

import { UpgradeCrown } from '@/components/upgrade-crown';
import { CHARACTERS_LIMIT_GRACE } from '@/lib/ui-constants';
import { cn } from '@/lib/utils';
import { AnimatedPromptTextarea } from './audio-generator';
import { Button } from './ui/button';

interface NonGrokPromptEditorProps {
  characterCountText?: ReactNode;
  charactersLimit: number;
  isEnhancingText: boolean;
  isFullscreen: boolean;
  isGenerating: boolean;
  isPaidUser: boolean;
  onEnhanceText: () => void;
  onTextChange: (text: string) => void;
  onToggleFullscreen: () => void;
  showEnhanceButton: boolean;
  text: string;
  textareaMaxLength?: number | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  textareaRightPadding: string;
  textIsOverLimit: boolean;
}

export function NonGrokPromptEditor({
  charactersLimit,
  characterCountText,
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
  textareaMaxLength,
  textareaRightPadding,
  textIsOverLimit,
}: NonGrokPromptEditorProps) {
  const t = useTranslations('generate');

  return (
    <>
      <AnimatedPromptTextarea
        className={cn(
          'textarea-2 bg-transparent transition-[height] duration-200 ease-in-out',
          textareaRightPadding,
        )}
        data-testid="generate-textarea"
        maxLength={
          textareaMaxLength === null
            ? undefined
            : (textareaMaxLength ?? charactersLimit + CHARACTERS_LIMIT_GRACE)
        }
        onChange={(e) => onTextChange(e.target.value)}
        placeholder={t('textAreaPlaceholder')}
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
            title={t('enhanceTextTitle')}
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
          title={t('fullscreenTitle')}
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
          textIsOverLimit && 'text-red-500',
        )}
        data-testid="generate-character-count"
      >
        {characterCountText ?? (
          <>
            {text.length} / {charactersLimit}
            <UpgradeCrown
              paid={isPaidUser}
              tooltip={
                isPaidUser
                  ? t('paidCharacterLimitTooltip')
                  : t('upgradeCharacterLimitTooltip')
              }
            />
          </>
        )}
      </div>
    </>
  );
}
