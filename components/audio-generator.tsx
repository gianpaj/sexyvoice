'use client';

import { useCompletion } from '@ai-sdk/react';
import {
  CircleStop,
  Download,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAudio } from '@/app/[lang]/(dashboard)/dashboard/clone/audio-provider';
import { toast } from '@/components/services/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { getCharactersLimit } from '@/lib/ai';
import { downloadUrl } from '@/lib/download';
import { APIError } from '@/lib/error-ts';
import type lang from '@/lib/i18n/dictionaries/en.json';
import { resizeTextarea } from '@/lib/react-textarea-autosize';
import { MAX_FREE_GENERATIONS } from '@/lib/supabase/constants';
import { cn } from '@/lib/utils';
import { AudioPlayerWithContext } from './audio-player-with-context';
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
  const [audioURL, setAudioURL] = useState('');
  const [shortcutKey, setShortcutKey] = useState('⌘+Enter');
  const [isEnhancingText, setIsEnhancingText] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null);

  const audio = useAudio();
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

      const data = await response.json();

      if (!response.ok) {
        // Check if we have an error code for translation
        if (data.errorCode && dict[data.errorCode as keyof typeof dict]) {
          const errorMessage = dict[
            data.errorCode as keyof typeof dict
          ] as string;
          throw new APIError(
            errorMessage.replace('__COUNT__', MAX_FREE_GENERATIONS.toString()),
            response,
          );
        }

        // Fallback to the default English error message from API
        throw new APIError(data.error || data.serverMessage, response);
      }

      const { url } = data;

      // FIXME: this doesn't work
      // refetch credits after generating audio
      // setTimeout(() => {
      // await queryClient.refetchQueries({
      //   queryKey: ['credits'],
      // });
      // console.log('Credits refetched');
      // }, 1000);

      setAudioURL(url);
      audio?.setUrlAndPlay(url);

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

  const resetPlayer = () => {
    if (!audio) {
      return;
    }

    audio?.reset();
  };

  const downloadAudio = async () => {
    // Prepare the anchor element once in a closure scope
    const anchorElement = document.createElement('a');
    document.body.appendChild(anchorElement);
    anchorElement.style.display = 'none';

    if (!audio?.url) return;

    try {
      await downloadUrl(audioURL, anchorElement);
    } catch {
      toast.error(dict.error);
    }
  };

  const { complete } = useCompletion({
    api: '/api/generate-text',
  });

  const handleEnhanceText = async () => {
    if (!(text.trim() && selectedVoice)) return;

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: needed
  useEffect(() => {
    setEstimatedCredits(null);
  }, [selectedVoice, text]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need text
  useEffect(() => {
    // Auto-resize textarea when content changes
    if (textareaRef.current && !isFullscreen) {
      resizeTextarea(textareaRef.current, 6);
    }
  }, [text, isFullscreen]);

  const textIsOverLimit = text.length > charactersLimit;

  const handleEstimateCredits = async () => {
    if (!(selectedVoice && isGeminiVoice && text.trim())) return;

    setIsEstimating(true);
    try {
      const response = await fetch('/api/estimate-credits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice: selectedVoice.name,
          styleVariant: selectedStyle,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new APIError(data.error || dict.error, response);
      }

      const estimatedCredits = Number(data.estimatedCredits);
      if (Number.isFinite(estimatedCredits)) {
        setEstimatedCredits(estimatedCredits);
      }
    } catch (error) {
      if (error instanceof APIError) {
        toast.error(error.message || dict.error);
      } else {
        toast.error(dict.errorEstimating);
      }
    } finally {
      setIsEstimating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{dict.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6 sm:pt-4">
        <div className="space-y-2">
          <div className="relative">
            <Textarea
              className={cn(
                'textarea-2 transition-[height] duration-200 ease-in-out',
                [isGeminiVoice ? 'pr-16' : 'pr-[7.5rem]'],
              )}
              maxLength={charactersLimit * 2}
              onChange={(e) => setText(e.target.value)}
              placeholder={dict.textAreaPlaceholder}
              ref={textareaRef}
              style={
                {
                  '--ta2-height': isFullscreen ? '30vh' : '8rem',
                } as React.CSSProperties
              }
              value={text}
            />
            {!isGeminiVoice && (
              <>
                <TooltipProvider>
                  <Tooltip delayDuration={100} supportMobileTap>
                    <TooltipTrigger asChild>
                      <Info className="absolute top-4 right-24 ml-2 h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>This model supports emotion tags</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  className="absolute top-2 right-12 h-8 w-8 hover:bg-zinc-800"
                  disabled={!text.trim() || isEnhancingText || isGenerating}
                  onClick={handleEnhanceText}
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
              </>
            )}
            <Button
              className={
                'absolute top-2 right-2 h-8 w-8 text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }
              onClick={() => setIsFullscreen(!isFullscreen)}
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
          </div>

          <div
            className={cn('text-right text-muted-foreground text-sm', [
              textIsOverLimit ? 'font-bold text-red-500' : '',
            ])}
          >
            {text.length} / {charactersLimit}
          </div>
          {isGeminiVoice && (
            <div className="flex items-center justify-between rounded-lg border border-input border-dashed p-3 sm:p-2">
              <Button
                className="h-8 bg-secondary text-xs"
                disabled={
                  !text.trim() ||
                  isEstimating ||
                  isGenerating ||
                  textIsOverLimit
                }
                onClick={handleEstimateCredits}
                size="sm"
                variant="outline"
              >
                {isEstimating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  dict.estimateCreditsButton
                )}
              </Button>
              {estimatedCredits !== null && (
                <div className="text-muted-foreground text-xs">
                  ~{estimatedCredits.toString()}
                </div>
              )}
            </div>
          )}
        </div>

        <div
          className={cn(
            'grid grid-cols-1 justify-start gap-3 sm:grid-cols-2',
            hasEnoughCredits ? 'items-center' : 'flex flex-col items-start',
          )}
        >
          {!hasEnoughCredits && (
            <Alert className="w-fit" variant="destructive">
              <AlertDescription>{dict.notEnoughCredits}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-grow-0 gap-2">
            <Button
              className="h-10 w-full sm:w-fit"
              data-testid="generate-button"
              disabled={
                isGenerating ||
                !text.trim() ||
                !selectedVoice ||
                !hasEnoughCredits ||
                textIsOverLimit
              }
              onClick={handleGenerate}
              size="lg"
            >
              {isGenerating ? (
                <span className="flex items-center">
                  {dict.generating}
                  <PulsatingDots />
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {dict.ctaButton}
                  <span className="rounded-sm border-[1px] border-gray-400 p-1 text-gray-300 text-xs opacity-70">
                    {shortcutKey}
                  </span>
                </span>
              )}
            </Button>
            {isGenerating && (
              <Button
                aria-label={dict.cancel}
                className="cursor-pointer border-none p-0 text-gray-300 hover:bg-transparent hover:text-white"
                icon={() => <CircleStop className="!size-8" name="cancel" />}
                iconPlacement="right"
                onClick={handleCancel}
                size="icon"
                title={dict.cancel}
                variant="outline"
              />
            )}
          </div>

          <div>
            {audioURL && (
              <div className="flex justify-start gap-2 sm:w-full">
                <AudioPlayerWithContext
                  className="rounded-md"
                  playAudioTitle={dict.playAudio}
                  url={audioURL}
                />
                <Button
                  onClick={resetPlayer}
                  size="icon"
                  title={dict.resetPlayer}
                  variant="secondary"
                >
                  <RotateCcw className="size-6" />
                </Button>
                <Button
                  onClick={downloadAudio}
                  size="icon"
                  title={dict.downloadAudio}
                  variant="secondary"
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
