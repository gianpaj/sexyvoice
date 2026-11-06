'use client';

import { useCompletion } from '@ai-sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleStop, Download, Loader2, RotateCcw } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useFFmpegJoiner } from '@/app/[lang]/tools/audio-joiner/hooks/use-ffmpeg-joiner';
import { useAudio } from '@/components/audio-provider';
import { toast } from '@/components/services/toast';
import { SpotlightField } from '@/components/spotlight-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_GENERATION_SETTINGS,
  type GenerationSettings,
} from '@/hooks/use-generation-settings';
import { downloadUrl } from '@/lib/download';
import { resizeTextarea } from '@/lib/react-textarea-autosize';
import {
  randomSeed,
  validateGenerationInput,
} from '@/lib/tts/generation-input';
import { getTtsModel } from '@/lib/tts/models';
import {
  estimateSpeech,
  generateSpeech,
  type SpeechParams,
  speechErrorMessage,
} from '@/lib/tts/speech-client';
import { cn } from '@/lib/utils';
import { getVoiceDisplayName } from '@/lib/voice-names';
import { useGenerationProgressToast } from './audio-generator/hooks/use-generation-progress-toast';
import { useSplitSegments } from './audio-generator/hooks/use-split-segments';
import { SplitSegmentsPanel } from './audio-generator/split-segments-panel';
import {
  SPLIT_SEGMENT_MAX_COUNT,
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
>(({ children, className, onBlur, onFocus, ...props }, ref) => (
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
));
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
  hasEnoughCredits: boolean;
  isPaidUser: boolean;
  selectedStyle?: string;
  selectedVoice?: Tables<'voices'>;
  settings?: GenerationSettings;
}

export function AudioGenerator({
  hasEnoughCredits,
  isPaidUser,
  selectedStyle,
  selectedVoice,
  settings = DEFAULT_GENERATION_SETTINGS,
}: AudioGeneratorProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('generate');
  const translateErrorCode = useTranslations('errorCodes');
  const [text, setText] = useState('');
  const [textImproved, setTextImproved] = useState(false);
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

  const textRevisionRef = useRef(0);

  const handleTextChange = (value: string) => {
    textRevisionRef.current += 1;
    setText(value);
    if (!value.trim()) setTextImproved(false);
  };

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const retryAbortController = useRef<AbortController | null>(null);

  const audio = useAudio();
  const {
    join: joinSegments,
    isProcessing: isJoiningSegments,
    isLoading: isJoinerLoading,
  } = useFFmpegJoiner();

  const ttsModel = getTtsModel(selectedVoice?.model);
  const isGeminiVoice = ttsModel?.provider === 'gemini';
  const isGrokVoice = ttsModel?.provider === 'grok';
  const showEnhanceButton = Boolean(ttsModel?.enhancePrompt);
  const canEstimateCredits = Boolean(ttsModel?.canEstimate);

  const input = ttsModel
    ? validateGenerationInput(ttsModel, {
        isPaidUser,
        style: selectedStyle,
        text,
      })
    : null;
  const charactersLimit = input?.textLimit ?? 0;
  const splitSegmentTexts = useMemo(
    () =>
      splitLongTextIntoSegments(text, {
        preserveGrokWrappingTags: isGrokVoice,
      }),
    [text, isGrokVoice],
  );
  const splitGenerationContext = useMemo(
    () =>
      JSON.stringify({
        language: isGrokVoice ? selectedGrokLanguage : '',
        styleVariant: isGeminiVoice ? selectedStyle : '',
      }),
    [isGeminiVoice, isGrokVoice, selectedGrokLanguage, selectedStyle],
  );
  const previewSplitSegmentTexts = useMemo(
    () => splitSegmentTexts.slice(0, SPLIT_SEGMENT_MAX_COUNT),
    [splitSegmentTexts],
  );
  const shouldDisableCharactersLimit = isPaidUser && splitTextAudios;
  const shouldUseSplitMode =
    shouldDisableCharactersLimit && splitSegmentTexts.length > 1;
  const textIsOverLimit =
    !shouldDisableCharactersLimit && Boolean(input?.textTooLong);
  const inputIsOverLimit = textIsOverLimit || Boolean(input?.styleTooLong);
  const {
    splitSegments,
    allSegmentsGenerated,
    markSegmentGenerating,
    markSegmentIdle,
    markSegmentSuccess,
    markSegmentFailed,
    updateSegmentText,
  } = useSplitSegments({
    generationContext: splitGenerationContext,
    selectedVoiceName: selectedVoice?.name,
    shouldUseSplitMode,
    splitSegmentTexts: previewSplitSegmentTexts,
    text,
  });
  const { showGenerationProgressToast, dismissGenerationProgressToast } =
    useGenerationProgressToast(
      selectedVoice ? getVoiceDisplayName(selectedVoice) : undefined,
    );

  let textareaRightPadding = 'pr-16';

  if (isGeminiVoice) {
    textareaRightPadding = 'pr-10';
  } else if (showEnhanceButton) {
    textareaRightPadding = 'pr-20';
  }

  const speechParams: SpeechParams | null =
    selectedVoice && ttsModel
      ? {
          isPaidUser,
          language: selectedGrokLanguage,
          model: ttsModel,
          settings,
          style: selectedStyle,
          textImproved,
          voiceId: selectedVoice.id,
        }
      : null;

  const requestSpeech = (
    params: SpeechParams,
    request: { seed?: number; split: boolean; text: string },
    signal: AbortSignal,
  ) =>
    generateSpeech(params, request, {
      fallback: t('error'),
      queryClient,
      signal,
      translateErrorCode,
    });

  const generateSplitAudios = async (
    params: SpeechParams,
    signal: AbortSignal,
  ) => {
    if (splitSegments.length === 0) return;

    const currentSegmentTexts = splitSegments.map((segment) =>
      segment.text.trim(),
    );
    if (currentSegmentTexts.some((segmentText) => !segmentText)) {
      toast.error(t('split.segmentCannotBeEmpty'));
      return;
    }

    let latestSegments = [...splitSegments];
    let encounteredFailure = false;

    // Only surface the progress toast when more than one segment will actually
    // be generated. Segments that already succeeded are skipped below, so a
    // retry-via-generate run that resolves to a single pending segment must
    // not show the progress modal.
    const pendingSegmentCount = currentSegmentTexts.reduce(
      (count, _segmentText, segmentIndex) => {
        const existing = latestSegments[segmentIndex];
        const willSkip = existing?.status === 'success' && !!existing.audioUrl;
        return willSkip ? count : count + 1;
      },
      0,
    );
    const showProgress = pendingSegmentCount > 1;
    let pendingProgressIndex = 0;

    for (let index = 0; index < currentSegmentTexts.length; index++) {
      const existing = latestSegments[index];
      if (existing?.status === 'success' && existing.audioUrl) {
        continue;
      }
      pendingProgressIndex += 1;

      latestSegments = latestSegments.map((segment, segmentIndex) =>
        segmentIndex === index
          ? { ...segment, audioUrl: '', status: 'generating' }
          : segment,
      );
      markSegmentGenerating(index);
      const isLastPendingSegment = pendingProgressIndex === pendingSegmentCount;
      if (showProgress) {
        showGenerationProgressToast(pendingProgressIndex, pendingSegmentCount);
      }

      try {
        const { url: generatedUrl } = await requestSpeech(
          params,
          { split: true, text: currentSegmentTexts[index] },
          signal,
        );

        latestSegments = latestSegments.map((segment, segmentIndex) =>
          segmentIndex === index
            ? { ...segment, audioUrl: generatedUrl, status: 'success' }
            : segment,
        );
        markSegmentSuccess(index, currentSegmentTexts[index], generatedUrl);
        if (isLastPendingSegment && showProgress) {
          showGenerationProgressToast(
            pendingProgressIndex,
            pendingSegmentCount,
            true,
          );
        }
      } catch (error) {
        if (signal.aborted) {
          latestSegments = latestSegments.map((segment, segmentIndex) =>
            segmentIndex === index
              ? { ...segment, audioUrl: '', status: 'idle' }
              : segment,
          );
          markSegmentIdle(index);
          return;
        }

        latestSegments = latestSegments.map((segment, segmentIndex) =>
          segmentIndex === index ? { ...segment, status: 'failed' } : segment,
        );
        markSegmentFailed(index);
        toast.error(
          speechErrorMessage(
            error,
            t('split.segmentFailed').replace('__INDEX__', String(index + 1)),
          ),
        );

        encounteredFailure = true;
        break;
      }
    }

    if (!encounteredFailure) {
      toast.success(t('success'));
    }
  };

  const handleGenerate = async () => {
    if (!speechParams) return;

    if (
      shouldUseSplitMode &&
      splitSegmentTexts.length > SPLIT_SEGMENT_MAX_COUNT
    ) {
      toast.error(
        t('split.tooManySegments').replace(
          '__COUNT__',
          String(SPLIT_SEGMENT_MAX_COUNT),
        ),
      );
      return;
    }

    const controller = new AbortController();
    abortController.current = controller;
    setIsGenerating(true);
    // Clear the previous result before a new generation.
    setAudioURL('');
    try {
      if (shouldUseSplitMode) {
        await generateSplitAudios(speechParams, controller.signal);
        return;
      }

      const { url } = await requestSpeech(
        speechParams,
        { split: false, text },
        controller.signal,
      );
      setAudioURL(url);
      toast.success(t('success'));
    } catch (error) {
      if (!controller.signal.aborted) {
        toast.error(speechErrorMessage(error, t('error')));
      }
    } finally {
      dismissGenerationProgressToast();
      setIsGenerating(false);
    }
  };

  const handleCancel = () => {
    setIsGenerating(false);
    abortController.current?.abort();
    retryAbortController.current?.abort();
  };

  const handleRetrySegment = async (segmentIndex: number) => {
    const segment = splitSegments[segmentIndex];
    if (!segment || isGenerating || !speechParams) {
      return;
    }

    const controller = new AbortController();
    retryAbortController.current = controller;

    setIsGenerating(true);
    markSegmentGenerating(segmentIndex);
    showGenerationProgressToast(segmentIndex + 1, splitSegments.length);

    try {
      const { url: generatedUrl } = await requestSpeech(
        speechParams,
        { seed: randomSeed(), split: true, text: segment.text },
        controller.signal,
      );

      markSegmentSuccess(segmentIndex, segment.text, generatedUrl);
      showGenerationProgressToast(segmentIndex + 1, splitSegments.length, true);
      toast.success(
        t('split.segmentGenerated').replace(
          '__INDEX__',
          String(segmentIndex + 1),
        ),
      );
    } catch (error) {
      if (controller.signal.aborted) {
        markSegmentIdle(segmentIndex);
        return;
      }

      markSegmentFailed(segmentIndex);
      toast.error(
        speechErrorMessage(
          error,
          t('split.segmentRetryFailed').replace(
            '__INDEX__',
            String(segmentIndex + 1),
          ),
        ),
      );
    } finally {
      setIsGenerating(false);
      dismissGenerationProgressToast();
    }
  };

  const resetPlayer = () => {
    if (playerControls) {
      playerControls.reset();
      return;
    }

    if (audio) {
      audio.reset();
    }
  };

  const downloadAudio = async (url: string) => {
    try {
      await downloadUrl(url, document.createElement('a'));
    } catch {
      toast.error(t('error'));
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
          endSec: durationSec,
          file,
          startSec: 0,
        });
      }

      const outputFormat = isGrokVoice ? 'mp3' : 'wav';
      const outputBlob = await joinSegments(segmentInputs, outputFormat);
      const outputUrl = URL.createObjectURL(outputBlob);
      const anchor = document.createElement('a');
      anchor.href = outputUrl;
      anchor.download = `generated-audio.${outputFormat}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(outputUrl), 5000);
    } catch (error) {
      console.error('Failed to download all segments:', error);
      toast.error(t('split.downloadAllFailed'));
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

    const originalText = text;
    const originalTextImproved = textImproved;
    const originalTextRevision = textRevisionRef.current;
    setIsEnhancingText(true);

    try {
      const enhancedText = await complete(originalText, {
        body: {
          selectedVoiceLanguage: selectedVoice.language,
          voiceModel: selectedVoice.model,
        },
      });

      if (enhancedText && textRevisionRef.current === originalTextRevision) {
        handleTextChange(enhancedText);
        setTextImproved(true);
        toast('Text enhanced with emotion tags!', {
          action: {
            label: 'Undo',
            onClick: () => {
              handleTextChange(originalText);
              setTextImproved(originalTextImproved);
            },
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

  const handleEstimateCredits = async () => {
    if (!(speechParams && canEstimateCredits && text.trim())) return;

    setIsEstimating(true);
    const options = { fallback: t('errorEstimating'), translateErrorCode };
    const texts = shouldUseSplitMode
      ? splitSegments.map((segment) => segment.text)
      : [text];
    try {
      const credits = await Promise.all(
        texts.map((segmentText) =>
          estimateSpeech(speechParams, segmentText, options),
        ),
      );
      setEstimatedCredits(credits.reduce((total, value) => total + value, 0));
    } catch (error) {
      toast.error(speechErrorMessage(error, t('errorEstimating')));
    } finally {
      setIsEstimating(false);
    }
  };

  return (
    <Card data-testid="audio-generator-card">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {isGrokVoice ? (
            <GrokTTSEditor
              charactersLimit={charactersLimit}
              enforceCharactersLimit={!shouldDisableCharactersLimit}
              isPaidUser={isPaidUser}
              onChange={handleTextChange}
              placeholder={t('textAreaPlaceholder')}
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
              isEnhancingText={isEnhancingText}
              isFullscreen={isFullscreen}
              isGenerating={isGenerating}
              isPaidUser={isPaidUser}
              onEnhanceText={handleEnhanceText}
              onTextChange={handleTextChange}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              showEnhanceButton={showEnhanceButton}
              text={text}
              textareaMaxLength={
                shouldDisableCharactersLimit ? null : undefined
              }
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
                    {t('split.splitToggleLabel')}
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
                  <p>{t('split.splitToggleDisabled')}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          {canEstimateCredits && (
            <CreditEstimator
              buttonLabel={t('estimateCreditsButton')}
              estimatedCredits={estimatedCredits}
              isEstimating={isEstimating}
              isGenerating={isGenerating}
              onEstimateCredits={handleEstimateCredits}
              text={text}
              textIsOverLimit={inputIsOverLimit}
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
              <AlertDescription>{t('notEnoughCredits')}</AlertDescription>
            </Alert>
          )}
          <div className="flex grow-0 gap-2">
            <GenerateButton
              className="h-10 w-full sm:w-fit"
              ctaText={
                shouldUseSplitMode ? t('ctaButtonPlural') : t('ctaButton')
              }
              data-testid="generate-button"
              disabled={
                isGenerating ||
                !text.trim() ||
                !selectedVoice ||
                !hasEnoughCredits ||
                inputIsOverLimit
              }
              generatingText={`${t('generating')}...`}
              isGenerating={isGenerating}
              onClick={handleGenerate}
              size="lg"
            />
            {isGenerating && (
              <Button
                aria-label={t('cancel')}
                className="cursor-pointer border-none p-0 text-gray-300 hover:bg-transparent hover:text-white"
                icon={() => <CircleStop className="size-8!" name="cancel" />}
                iconPlacement="right"
                onClick={handleCancel}
                size="icon"
                title={t('cancel')}
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
                  onControlsReady={setPlayerControls}
                  playAudioTitle={t('playAudio')}
                  progressColor="#8b5cf6"
                  showWaveform
                  url={audioURL}
                  waveColor="#888888"
                  waveformClassName="w-48"
                />
                <Button
                  onClick={resetPlayer}
                  size="icon"
                  title={t('resetPlayer')}
                  variant="secondary"
                >
                  <RotateCcw className="size-6" />
                </Button>
                <Button
                  onClick={() => downloadAudio(audioURL)}
                  size="icon"
                  title={t('downloadAudio')}
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
            isDownloadingAllSegments={isDownloadingAllSegments}
            isGenerating={isGenerating}
            isJoinerLoading={isJoinerLoading}
            isJoiningSegments={isJoiningSegments}
            onDownloadAllSegments={handleDownloadAllSegments}
            onDownloadSegment={downloadAudio}
            onRetrySegment={handleRetrySegment}
            onSegmentTextChange={updateSegmentText}
            segments={splitSegments}
          />
        )}
      </CardContent>
    </Card>
  );
}
