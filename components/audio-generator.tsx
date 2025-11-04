'use client';

import { useCompletion } from '@ai-sdk/react';
import {
  CircleStop,
  Download,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { getCharactersLimit } from '@/lib/ai';
import { APIError } from '@/lib/error-ts';
import type lang from '@/lib/i18n/dictionaries/en.json';
import { resizeTextarea } from '@/lib/react-textarea-autosize';
import { MAX_FREE_GENERATIONS } from '@/lib/supabase/constants';
import { cn } from '@/lib/utils';
import PulsatingDots from './PulsatingDots';
import { Alert, AlertDescription } from './ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

interface AudioGeneratorProps {
  selectedVoice?: Voice;
  selectedStyle?: string;
  hasEnoughCredits: boolean;
  dict: (typeof lang)['generate'];
  locale: string;
}

export function AudioGenerator({
  selectedVoice,
  selectedStyle,
  hasEnoughCredits,
  dict,
}: AudioGeneratorProps) {
  const [text, setText] = useState('');
  const [previousText, setPreviousText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [shortcutKey, setShortcutKey] = useState('⌘+Enter');
  const [isEnhancingText, setIsEnhancingText] = useState(false);

  const isGeminiVoice = selectedVoice?.model === 'gpro';
  const charactersLimit = useMemo(
    () => getCharactersLimit(selectedVoice?.model || ''),
    [selectedVoice],
  );

  useEffect(() => {
    // Check if running on Mac for keyboard shortcut display
    const isMac =
      navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
      navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    setShortcutKey(isMac ? '⌘+Enter' : 'Ctrl+Enter');
  }, []);

  const abortController = useRef<AbortController | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      abortController.current = new AbortController();

      const styleVariant = isGeminiVoice ? selectedStyle : '';

      const response = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice: selectedVoice?.name,
          styleVariant,
        }),
        signal: abortController.current.signal,
      });

      if (!response.ok) {
        const error: any = await response.json();

        // Check if we have an error code for translation
        if (error.errorCode && dict[error.errorCode as keyof typeof dict]) {
          const errorMessage = dict[
            error.errorCode as keyof typeof dict
          ] as string;
          throw new APIError(
            errorMessage.replace('__COUNT__', MAX_FREE_GENERATIONS.toString()),
            response,
          );
        }

        // Fallback to the default English error message from API
        throw new APIError(error.error || error.serverMessage, response);
      }

      const { url } = await response.json();

      // creditsUsed is undefined if the audio was previously generated
      // creditsUsed && setCreditsUsed(creditsUsed);

      const newAudio = new Audio(url);

      newAudio.addEventListener('ended', () => {
        setIsPlaying(false);
      });

      setAudio(newAudio);

      // Automatically play the audio
      newAudio.play();
      setIsPlaying(true);

      toast.success(dict.success);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      if (error instanceof APIError) {
        toast.error(error.message || dict.error);
      } else {
        toast.error(dict.error);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCancel = () => {
    setIsGenerating(false);
    abortController.current?.abort();
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: it's grand
  useEffect(() => {
    // Keyboard shortcut handler
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for CMD+Enter on Mac or Ctrl+Enter on other platforms
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();

        // Only trigger if form can be submitted
        if (!isGenerating && text.trim() && selectedVoice && hasEnoughCredits) {
          handleGenerate();
        }
      }
    };

    // Add event listener to document
    document.addEventListener('keydown', handleKeyDown);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGenerating, text, selectedVoice, hasEnoughCredits]);

  const togglePlayback = () => {
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const resetPlayer = () => {
    if (!audio) {
      setIsPlaying(false);
      return;
    }

    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (error) {
      console.error('Failed to reset audio', error);
    } finally {
      setAudio(null);
      setIsPlaying(false);
    }
  };

  const downloadAudio = () => {
    if (!audio) return;

    const link = document.createElement('a');
    link.href = audio.src;
    link.download = 'generated_audio.mp3';
    link.target = '_blank';
    link.click();
  };

  const { complete } = useCompletion({
    api: '/api/generate-text',
  });

  const handleEnhanceText = async () => {
    if (!text.trim() || !selectedVoice) return;

    setIsEnhancingText(true);
    setPreviousText(text);
    try {
      const enhancedText = await complete(text, {
        body: { selectedVoiceLanguage: selectedVoice.language },
      });

      if (enhancedText) {
        setText(enhancedText);
        toast('Text enhanced with emotion tags!', {
          action: {
            label: 'Undo',
            onClick: () => setText(previousText),
          },
        });
      }
    } catch (error) {
      console.error('Error enhancing text:', error);
      toast.error('Failed to enhance text');
    } finally {
      setIsEnhancingText(false);
    }
  };
  const [isFullscreen, setIsFullscreen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need text
  useEffect(() => {
    // Auto-resize textarea when content changes
    if (textareaRef.current && !isFullscreen) {
      resizeTextarea(textareaRef.current, 6);
    }
  }, [text, isFullscreen]);

  const textIsOverLimit = text.length > charactersLimit;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dict.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 sm:p-6 p-4">
        <div className="space-y-2">
          <div className="relative">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={dict.textAreaPlaceholder}
              maxLength={charactersLimit * 2}
              className={cn(
                'textarea-2 transition-[height] duration-200 ease-in-out',
                [isGeminiVoice ? 'pr-16' : 'pr-[7.5rem]'],
              )}
              style={
                {
                  '--ta2-height': isFullscreen ? '30vh' : '8rem',
                } as React.CSSProperties
              }
              ref={textareaRef}
            />
            {!isGeminiVoice && (
              <>
                <TooltipProvider>
                  <Tooltip delayDuration={100} supportMobileTap>
                    <TooltipTrigger asChild>
                      <Info className="w-4 h-4 ml-2 absolute top-4 right-24" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>This model supports emotion tags</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-12 h-8 w-8 hover:bg-zinc-800"
                  onClick={handleEnhanceText}
                  disabled={!text.trim() || isEnhancingText || isGenerating}
                  title="Enhance text with AI emotion tags"
                >
                  {isEnhancingText ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-yellow-300" />
                  )}
                </Button>
              </>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={
                'absolute right-2 top-2 h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }
              title="Fullscreen"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
          <div
            className={cn('text-sm text-muted-foreground text-right', [
              textIsOverLimit ? 'text-red-500 font-bold' : '',
            ])}
          >
            {text.length} / {charactersLimit}
          </div>
        </div>

        <div
          className={cn(
            'grid grid-cols-1 sm:grid-cols-2 justify-start gap-3',
            hasEnoughCredits ? 'items-center' : 'flex flex-col items-start',
          )}
        >
          {!hasEnoughCredits && (
            <Alert variant="destructive" className="w-fit">
              <AlertDescription>{dict.notEnoughCredits}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-grow-0 gap-2">
            <Button
              onClick={handleGenerate}
              data-testid="generate-button"
              disabled={
                isGenerating ||
                !text.trim() ||
                !selectedVoice ||
                !hasEnoughCredits ||
                textIsOverLimit
              }
              size="lg"
              className="h-10"
            >
              {isGenerating ? (
                <span className="flex items-center">
                  {dict.generating}
                  <PulsatingDots />
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {dict.ctaButton}
                  <span className="text-xs text-gray-300 opacity-70 border-[1px] rounded-sm border-gray-400 p-1">
                    {shortcutKey}
                  </span>
                </span>
              )}
            </Button>
            {isGenerating && (
              <Button
                variant="outline"
                aria-label={dict.cancel}
                title={dict.cancel}
                size="icon"
                onClick={handleCancel}
                iconPlacement="right"
                icon={() => <CircleStop name="cancel" className="!size-8" />}
                className="border-none cursor-pointer text-gray-300 hover:text-white hover:bg-transparent p-0"
              />
            )}
          </div>

          <div>
            {audio && (
              <div className="flex sm:w-full justify-start gap-2">
                <Button
                  variant="secondary"
                  title={dict.playAudio}
                  size="icon"
                  onClick={togglePlayback}
                >
                  {isPlaying ? (
                    <Pause className="size-6" />
                  ) : (
                    <Play className="size-6" />
                  )}
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  title={dict.resetPlayer}
                  onClick={resetPlayer}
                >
                  <RotateCcw className="size-6" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  title={dict.downloadAudio}
                  onClick={downloadAudio}
                >
                  <Download className="size-6" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
