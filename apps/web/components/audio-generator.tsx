'use client';

import { useCompletion } from '@ai-sdk/react';
import { CircleStop, Download, Loader2, RotateCcw } from 'lucide-react';
import dynamic from 'next/dynamic';
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAudio } from '@/app/[lang]/(dashboard)/dashboard/clone/audio-provider';
import { useFFmpegJoiner } from '@/app/[lang]/tools/audio-joiner/hooks/use-ffmpeg-joiner';
import { toast } from '@/components/services/toast';
import { SpotlightField } from '@/components/spotlight-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getCharactersLimit } from '@/lib/ai';
import { downloadUrl } from '@/lib/download';
import { APIError } from '@/lib/error-ts';
import { resizeTextarea } from '@/lib/react-textarea-autosize';
import { MAX_FREE_GENERATIONS } from '@/lib/supabase/constants';
import { cn, getTtsProvider } from '@/lib/utils';
import type messages from '@/messages/en.json';
import { useGenerationProgressToast } from './audio-generator/hooks/use-generation-progress-toast';
import { useSplitSegments } from './audio-generator/hooks/use-split-segments';
import { SplitSegmentsPanel } from './audio-generator/split-segments-panel';
import {
  generateRetrySeed,
  splitLongTextIntoSegments,
} from './audio-generator/split-segments-utils';
import {
  type AudioPlayerControls,
  AudioPlayerWithContext,
} from './audio-player-with-context';
import { GenerateButton } from './generate-button';

const NonGrokPromptEditor = dynamic(
  () => import('./non-grok-editor').then((mod) => mod.NonGrokPromptEditor),
  { ssr: false },
);

import { GrokTTSEditor } from './grok-tts-editor';
import { Alert, AlertDescription } from './ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

interface AnimatedPromptTextareaProps
  extends ComponentPropsWithoutRef<typeof Textarea> {
  children?: ReactNode;
}

export const AnimatedPromptTextarea = forwardRef<
  HTMLTextAreaElement,
  AnimatedPromptTextareaProps
>(({ children, className, onBlur, onFocus, ...props }, ref) => {
  return (
    <SpotlightField>
      <Textarea
        className={cn(
          'border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0',
          className,
        )}
        onBlur={onBlur}
        onFocus={onFocus}
        ref={ref}
        {...props}
      />
      {children}
    </SpotlightField>
  );
});
AnimatedPromptTextarea.displayName = 'AnimatedPromptTextarea';

interface CreditEstimatorProps {
  buttonLabel: string;
  estimatedCredits: number | null;
  isEstimating: boolean;
  isGenerating: boolean;
  onEstimateCredits: () => void;
  text: string;
  textIsOverLimit: boolean;
}

function CreditEstimator({
  buttonLabel,
  estimatedCredits,
  isEstimating,
  isGenerating,
  onEstimateCredits,
  text,
  textIsOverLimit,
}: CreditEstimatorProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-input border-dashed p-3 sm:p-2">
      <Button
        className="h-8 text-xs"
        disabled={
          !text.trim() || isEstimating || isGenerating || textIsOverLimit
        }
        onClick={onEstimateCredits}
        size="sm"
        variant="secondary"
      >
        {isEstimating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          buttonLabel
        )}
      </Button>
      {estimatedCredits !== null && (
        <div className="text-muted-foreground text-xs">
          ~{estimatedCredits.toString()}
        </div>
      )}
    </div>
  );
}

interface AudioGeneratorProps {
  dict: (typeof messages)['generate'];
  hasEnoughCredits: boolean;
  isPaidUser: boolean;
  selectedStyle?: string;
  selectedVoice?: Tables<'voices'>;
}

export function AudioGenerator({
  dict,
  hasEnoughCredits,
  isPaidUser,
  selectedStyle,
  selectedVoice,
}: AudioGeneratorProps) {
  const [text, setText] = useState('');
  const [previousText, setPreviousText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioURL, setAudioURL] = useState('');
  const [isEnhancingText, setIsEnhancingText] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null);
  const [splitTextAudios, setSplitTextAudios] = useState(false);
  const [isDownloadingAllSegments, setIsDownloadingAllSegments] =
    useState(false);
  const [playerControls, setPlayerControls] =
    useState<AudioPlayerControls | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedGrokLanguage, setSelectedGrokLanguage] = useState('auto');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const retryAbortController = useRef<AbortController | null>(null);

  const audio = useAudio();
  const {
    join: joinSegments,
    isProcessing: isJoiningSegments,
    isLoading: isJoinerLoading,
  } = useFFmpegJoiner();

  const provider = getTtsProvider(selectedVoice?.model);
  const isGeminiVoice = provider === 'gemini';
  const isGrokVoice = provider === 'grok';
  const showEnhanceButton = provider === 'replicate';
  const canEstimateCredits = isGeminiVoice || isGrokVoice;

  const charactersLimit = getCharactersLimit();
  const shouldUseSplitMode = isPaidUser && splitTextAudios;
  const textIsOverLimit = !shouldUseSplitMode && text.length > charactersLimit;
  const splitSegmentTexts = useMemo(
    () =>
      splitLongTextIntoSegments(text, {
        preserveGrokWrappingTags: isGrokVoice,
      }),
    [text, isGrokVoice],
  );
  const {
    splitSegments,
    allSegmentsGenerated,
    markSegmentGenerating,
    markSegmentIdle,
    markSegmentSuccess,
    markSegmentFailed,
    updateSegmentText,
  } = useSplitSegments({
    selectedVoiceName: selectedVoice?.name,
    text,
    shouldUseSplitMode,
    splitSegmentTexts,
  });
  const { showGenerationProgressToast, dismissGenerationProgressToast } =
    useGenerationProgressToast(selectedVoice?.name, dict.split);

  const textareaRightPadding = useMemo(() => {
    if (isGeminiVoice) {
      return 'pr-10';
    }

    if (showEnhanceButton) {
      return 'pr-20';
    }

    return 'pr-16';
  }, [isGeminiVoice, showEnhanceButton]);

  const requestGenerateVoice = useCallback(
    async (segmentText: string, signal: AbortSignal, seed?: number) => {
      if (!selectedVoice) {
        throw new APIError(dict.error, new Response(null, { status: 400 }));
      }

      const response = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: segmentText,
          voice: selectedVoice.name,
          styleVariant: isGeminiVoice ? selectedStyle : '',
          language: isGrokVoice ? selectedGrokLanguage : undefined,
          ...(seed === undefined ? {} : { seed }),
        }),
        signal,
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.errorCode && dict[data.errorCode as keyof typeof dict]) {
          const errorMessage = dict[
            data.errorCode as keyof typeof dict
          ] as string;
          throw new APIError(
            errorMessage.replace('__COUNT__', MAX_FREE_GENERATIONS.toString()),
            response,
          );
        }

        throw new APIError(data.error || data.serverMessage, response);
      }

      return data.url as string;
    },
    [
      dict,
      isGeminiVoice,
      isGrokVoice,
      selectedGrokLanguage,
      selectedStyle,
      selectedVoice,
    ],
  );

  const generateSingleAudio = useCallback(async () => {
    if (!selectedVoice) return;

    abortController.current = new AbortController();
    showGenerationProgressToast(1, 1);
    const url = await requestGenerateVoice(
      text,
      abortController.current.signal,
    );
    setAudioURL(url);
    toast.success(dict.success);
  }, [
    dict.success,
    requestGenerateVoice,
    selectedVoice,
    showGenerationProgressToast,
    text,
  ]);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential fail-fast flow
  const generateSplitAudios = useCallback(async () => {
    if (!(selectedVoice && splitSegments.length > 0)) return;

    const currentSegmentTexts = splitSegments.map((segment) =>
      segment.text.trim(),
    );
    if (currentSegmentTexts.some((segmentText) => !segmentText)) {
      toast.error(dict.split.segmentCannotBeEmpty);
      return;
    }

    abortController.current = new AbortController();
    setAudioURL('');

    let latestSegments = [...splitSegments];
    let encounteredFailure = false;

    for (let index = 0; index < currentSegmentTexts.length; index++) {
      const existing = latestSegments[index];
      if (existing?.status === 'success' && existing.audioUrl) {
        continue;
      }

      latestSegments = latestSegments.map((segment, segmentIndex) =>
        segmentIndex === index
          ? { ...segment, status: 'generating', audioUrl: '' }
          : segment,
      );
      markSegmentGenerating(index);
      const isLastSegment = index === currentSegmentTexts.length - 1;
      showGenerationProgressToast(index + 1, currentSegmentTexts.length);

      try {
        const generatedUrl = await requestGenerateVoice(
          currentSegmentTexts[index],
          abortController.current.signal,
        );

        latestSegments = latestSegments.map((segment, segmentIndex) =>
          segmentIndex === index
            ? { ...segment, status: 'success', audioUrl: generatedUrl }
            : segment,
        );
        markSegmentSuccess(index, currentSegmentTexts[index], generatedUrl);
        if (isLastSegment) {
          showGenerationProgressToast(
            index + 1,
            currentSegmentTexts.length,
            true,
          );
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          latestSegments = latestSegments.map((segment, segmentIndex) =>
            segmentIndex === index
              ? { ...segment, status: 'idle', audioUrl: '' }
              : segment,
          );
          markSegmentIdle(index);
          throw error;
        }

        latestSegments = latestSegments.map((segment, segmentIndex) =>
          segmentIndex === index ? { ...segment, status: 'failed' } : segment,
        );
        markSegmentFailed(index);

        if (error instanceof APIError) {
          toast.error(error.message || dict.error);
        } else {
          toast.error(
            dict.split.segmentFailed.replace('__INDEX__', String(index + 1)),
          );
        }

        encounteredFailure = true;
        break;
      }
    }

    if (!encounteredFailure) {
      toast.success(dict.success);
    }
  }, [
    dict.error,
    dict.success,
    dict.split.segmentCannotBeEmpty,
    dict.split.segmentFailed,
    markSegmentFailed,
    markSegmentGenerating,
    markSegmentIdle,
    markSegmentSuccess,
    requestGenerateVoice,
    selectedVoice,
    showGenerationProgressToast,
    splitSegments,
  ]);

  const handleGenerate = useCallback(async () => {
    if (!selectedVoice) return;

    setIsGenerating(true);
    try {
      if (shouldUseSplitMode) {
        await generateSplitAudios();
        return;
      }

      await generateSingleAudio();
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
      dismissGenerationProgressToast();
      setIsGenerating(false);
    }
  }, [
    dict.error,
    dismissGenerationProgressToast,
    generateSingleAudio,
    generateSplitAudios,
    selectedVoice,
    shouldUseSplitMode,
  ]);

  const handleCancel = useCallback(() => {
    setIsGenerating(false);
    abortController.current?.abort();
    retryAbortController.current?.abort();
  }, []);

  const handleRetrySegment = useCallback(
    async (segmentIndex: number) => {
      const segment = splitSegments[segmentIndex];
      if (!segment || isGenerating || !selectedVoice) {
        return;
      }

      const seed = generateRetrySeed();
      retryAbortController.current = new AbortController();

      setIsGenerating(true);
      markSegmentGenerating(segmentIndex);
      showGenerationProgressToast(segmentIndex + 1, splitSegments.length);

      try {
        const generatedUrl = await requestGenerateVoice(
          segment.text,
          retryAbortController.current.signal,
          seed,
        );

        markSegmentSuccess(segmentIndex, segment.text, generatedUrl);
        showGenerationProgressToast(
          segmentIndex + 1,
          splitSegments.length,
          true,
        );
        toast.success(
          dict.split.segmentGenerated.replace(
            '__INDEX__',
            String(segmentIndex + 1),
          ),
        );
      } catch (error) {
        markSegmentFailed(segmentIndex);
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        if (error instanceof APIError) {
          toast.error(error.message || dict.error);
        } else {
          toast.error(
            dict.split.segmentRetryFailed.replace(
              '__INDEX__',
              String(segmentIndex + 1),
            ),
          );
        }
      } finally {
        setIsGenerating(false);
        dismissGenerationProgressToast();
      }
    },
    [
      dict.error,
      dict.split.segmentGenerated,
      dict.split.segmentRetryFailed,
      dismissGenerationProgressToast,
      isGenerating,
      markSegmentFailed,
      markSegmentGenerating,
      markSegmentSuccess,
      requestGenerateVoice,
      selectedVoice,
      showGenerationProgressToast,
      splitSegments,
    ],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();

        if (
          !isGenerating &&
          text.trim() &&
          selectedVoice &&
          hasEnoughCredits &&
          !textIsOverLimit
        ) {
          handleGenerate().catch((error) => {
            console.error('Keyboard shortcut generation failed:', error);
          });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    handleGenerate,
    hasEnoughCredits,
    isGenerating,
    selectedVoice,
    text,
    textIsOverLimit,
  ]);

  const resetPlayer = () => {
    if (playerControls) {
      playerControls.reset();
      return;
    }

    if (audio) {
      audio.reset();
    }
  };

  const downloadSegmentAudio = async (segmentUrl: string) => {
    const anchorElement = document.createElement('a');
    document.body.appendChild(anchorElement);
    anchorElement.style.display = 'none';

    try {
      await downloadUrl(segmentUrl, anchorElement);
    } catch {
      toast.error(dict.error);
    } finally {
      document.body.removeChild(anchorElement);
    }
  };

  const downloadAudio = async () => {
    if (!audioURL) return;

    const anchorElement = document.createElement('a');
    document.body.appendChild(anchorElement);
    anchorElement.style.display = 'none';

    try {
      await downloadUrl(audioURL, anchorElement);
    } catch {
      toast.error(dict.error);
    } finally {
      document.body.removeChild(anchorElement);
    }
  };

  const getAudioDurationSeconds = (file: File) =>
    new Promise<number>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const element = new Audio(objectUrl);

      const cleanup = () => {
        URL.revokeObjectURL(objectUrl);
        element.removeEventListener('loadedmetadata', onLoadedMetadata);
        element.removeEventListener('error', onError);
      };

      const onLoadedMetadata = () => {
        const duration = element.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
          cleanup();
          reject(new Error('Unable to read segment duration'));
          return;
        }
        cleanup();
        resolve(duration);
      };

      const onError = () => {
        cleanup();
        reject(new Error('Unable to read segment duration'));
      };

      element.addEventListener('loadedmetadata', onLoadedMetadata);
      element.addEventListener('error', onError);
      element.load();
    });

  const handleDownloadAllSegments = async () => {
    if (!allSegmentsGenerated || isDownloadingAllSegments) {
      return;
    }

    setIsDownloadingAllSegments(true);
    try {
      const segmentInputs: Array<{
        file: File;
        startSec: number;
        endSec: number;
      }> = [];

      for (let index = 0; index < splitSegments.length; index++) {
        const currentSegment = splitSegments[index];

        if (!currentSegment.audioUrl) {
          throw new Error('Missing segment URL');
        }

        const response = await fetch(currentSegment.audioUrl);
        if (!response.ok) {
          throw new Error('Could not fetch generated segment');
        }

        const blob = await response.blob();
        const mimeType = blob.type || 'audio/wav';
        const extension = mimeType.includes('mpeg') ? 'mp3' : 'wav';
        const file = new File([blob], `segment-${index + 1}.${extension}`, {
          type: mimeType,
        });
        const durationSec = await getAudioDurationSeconds(file);

        segmentInputs.push({
          file,
          startSec: 0,
          endSec: durationSec,
        });
      }

      const outputBlob = await joinSegments(segmentInputs, 'wav');
      const outputUrl = URL.createObjectURL(outputBlob);
      const anchor = document.createElement('a');
      anchor.href = outputUrl;
      anchor.download = 'generated-audio.wav';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(outputUrl), 5000);
    } catch (error) {
      console.error('Failed to download all segments:', error);
      toast.error(dict.split.downloadAllFailed);
    } finally {
      setIsDownloadingAllSegments(false);
    }
  };

  const { complete } = useCompletion({
    api: '/api/generate-text',
    streamProtocol: 'text',
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

  const handleControlsReady = useCallback((controls: AudioPlayerControls) => {
    setPlayerControls(controls);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset estimate when voice or text changes
  useEffect(() => {
    setEstimatedCredits(null);
  }, [selectedVoice, text]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: textarea should resize when text or fullscreen changes
  useEffect(() => {
    if (textareaRef.current && !isFullscreen) {
      resizeTextarea(textareaRef.current, 6);
    }
  }, [text, isFullscreen]);

  const requestEstimateCredits = useCallback(
    async (textToEstimate: string) => {
      if (!(selectedVoice && canEstimateCredits)) {
        throw new APIError(
          dict.errorEstimating,
          new Response(null, { status: 400 }),
        );
      }

      const response = await fetch('/api/estimate-credits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: textToEstimate,
          voice: selectedVoice.name,
          styleVariant: isGeminiVoice ? selectedStyle : '',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new APIError(data.error || dict.error, response);
      }

      const value = Number(data.estimatedCredits);
      if (!Number.isFinite(value)) {
        throw new APIError(dict.errorEstimating, response);
      }

      return value;
    },
    [
      canEstimateCredits,
      dict.error,
      dict.errorEstimating,
      isGeminiVoice,
      selectedStyle,
      selectedVoice,
    ],
  );

  const handleEstimateCredits = async () => {
    if (!(selectedVoice && canEstimateCredits && text.trim())) return;

    setIsEstimating(true);
    try {
      if (shouldUseSplitMode) {
        const creditPromises = splitSegments.map((segment) =>
          requestEstimateCredits(segment.text),
        );
        const creditsPerSegment = await Promise.all(creditPromises);
        const totalEstimatedCredits = creditsPerSegment.reduce(
          (total, credits) => total + credits,
          0,
        );
        setEstimatedCredits(totalEstimatedCredits);
      } else {
        const nextEstimatedCredits = await requestEstimateCredits(text);
        setEstimatedCredits(nextEstimatedCredits);
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
          {isGrokVoice ? (
            <GrokTTSEditor
              charactersLimit={charactersLimit}
              dict={dict.grok}
              isPaidUser={isPaidUser}
              onChange={setText}
              placeholder={dict.textAreaPlaceholder}
              selectedGrokLanguage={selectedGrokLanguage}
              setSelectedGrokLanguage={setSelectedGrokLanguage}
              value={text}
            />
          ) : (
            <NonGrokPromptEditor
              characterCountText={
                shouldUseSplitMode
                  ? `${text.length} chars -> ${splitSegmentTexts.length} segments`
                  : undefined
              }
              charactersLimit={charactersLimit}
              dict={dict}
              isEnhancingText={isEnhancingText}
              isFullscreen={isFullscreen}
              isGenerating={isGenerating}
              isPaidUser={isPaidUser}
              onEnhanceText={handleEnhanceText}
              onTextChange={setText}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              showEnhanceButton={showEnhanceButton}
              text={text}
              textareaMaxLength={shouldUseSplitMode ? null : undefined}
              textareaRef={textareaRef}
              textareaRightPadding={textareaRightPadding}
              textIsOverLimit={textIsOverLimit}
            />
          )}

          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-between rounded-lg border border-input border-dashed px-3 py-2">
                  <Label
                    className={cn('text-sm', {
                      'cursor-not-allowed': !isPaidUser,
                    })}
                    htmlFor="split-text-audios"
                  >
                    {dict.split.splitToggleLabel}
                  </Label>
                  <Checkbox
                    checked={splitTextAudios}
                    disabled={!isPaidUser}
                    id="split-text-audios"
                    onCheckedChange={(checked) =>
                      setSplitTextAudios(Boolean(checked))
                    }
                  />
                </div>
              </TooltipTrigger>
              {!isPaidUser && (
                <TooltipContent>
                  <p>{dict.split.splitToggleDisabled}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          {canEstimateCredits && (
            <CreditEstimator
              buttonLabel={dict.estimateCreditsButton}
              estimatedCredits={estimatedCredits}
              isEstimating={isEstimating}
              isGenerating={isGenerating}
              onEstimateCredits={handleEstimateCredits}
              text={text}
              textIsOverLimit={textIsOverLimit}
            />
          )}
        </div>

        <div
          className={cn(
            'grid grid-cols-1 justify-start gap-3 sm:grid-cols-[1fr_2fr]',
            hasEnoughCredits ? '' : 'flex flex-col items-start',
          )}
        >
          {!hasEnoughCredits && (
            <Alert className="w-fit" variant="destructive">
              <AlertDescription>{dict.notEnoughCredits}</AlertDescription>
            </Alert>
          )}
          <div className="flex grow-0 gap-2">
            <GenerateButton
              className="h-10 w-full sm:w-fit"
              ctaText={splitTextAudios ? dict.ctaButtonPlural : dict.ctaButton}
              data-testid="generate-button"
              disabled={
                isGenerating ||
                !text.trim() ||
                !selectedVoice ||
                !hasEnoughCredits ||
                textIsOverLimit
              }
              generatingText={`${dict.generating}...`}
              isGenerating={isGenerating}
              onClick={handleGenerate}
              size="lg"
            />
            {isGenerating && (
              <Button
                aria-label={dict.cancel}
                className="cursor-pointer border-none p-0 text-gray-300 hover:bg-transparent hover:text-white"
                icon={() => <CircleStop className="size-8!" name="cancel" />}
                iconPlacement="right"
                onClick={handleCancel}
                size="icon"
                title={dict.cancel}
                variant="outline"
              />
            )}
          </div>

          <div className="flex justify-start gap-2 sm:w-full">
            {!shouldUseSplitMode && audioURL && (
              <>
                <AudioPlayerWithContext
                  autoPlay
                  className="rounded-md"
                  onControlsReady={handleControlsReady}
                  playAudioTitle={dict.playAudio}
                  progressColor="#8b5cf6"
                  showWaveform
                  url={audioURL}
                  waveColor="#888888"
                  waveformClassName="w-48"
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
              </>
            )}
          </div>
        </div>
        {shouldUseSplitMode && (
          <SplitSegmentsPanel
            allSegmentsGenerated={allSegmentsGenerated}
            dict={dict}
            isDownloadingAllSegments={isDownloadingAllSegments}
            isGenerating={isGenerating}
            isJoinerLoading={isJoinerLoading}
            isJoiningSegments={isJoiningSegments}
            onDownloadAllSegments={handleDownloadAllSegments}
            onDownloadSegment={downloadSegmentAudio}
            onRetrySegment={handleRetrySegment}
            onSegmentTextChange={updateSegmentText}
            segments={splitSegments}
          />
        )}
      </CardContent>
    </Card>
  );
}
