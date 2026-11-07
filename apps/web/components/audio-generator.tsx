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
  useRef,
  useState,
} from 'react';

import { useAudio } from '@/components/audio-provider';
import { toast } from '@/components/services/toast';
import { SplitSegmentsPanel } from '@/components/split-generation/split-segments-panel';
import { useSplitGeneration } from '@/components/split-generation/use-split-generation';
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
import { validateGenerationInput } from '@/lib/tts/generation-input';
import { getTtsModel } from '@/lib/tts/models';
import {
  estimateSpeech,
  generateSpeech,
  type SpeechParams,
  speechErrorMessage,
  speechRequestFields,
} from '@/lib/tts/speech-client';
import { cn } from '@/lib/utils';
import { getVoiceDisplayName } from '@/lib/voice-names';
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
  const [estimate, setEstimate] = useState<{
    credits: number;
    key: string;
  } | null>(null);
  const [splitTextAudios, setSplitTextAudios] = useState(false);
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

  const audio = useAudio();

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
  // Split mode lifts the whole-text limit: every segment fits a request.
  const splitEnabled = isPaidUser && splitTextAudios;
  const textIsOverLimit = !splitEnabled && Boolean(input?.textTooLong);
  const inputIsOverLimit = textIsOverLimit || Boolean(input?.styleTooLong);

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

  const split = useSplitGeneration({
    enabled: splitEnabled,
    params: speechParams,
    text,
    voiceName: selectedVoice ? getVoiceDisplayName(selectedVoice) : undefined,
  });

  /** Runs one generation or segment retry; Cancel aborts it. */
  const run = async (task: (signal: AbortSignal) => Promise<void>) => {
    const controller = new AbortController();
    abortController.current = controller;
    setIsGenerating(true);
    try {
      await task(controller.signal);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerate = () => {
    if (!speechParams) return;
    // Clear the previous result before a new generation.
    setAudioURL('');
    return run(async (signal) => {
      if (split.active) {
        await split.generate(signal);
        return;
      }
      try {
        const { url } = await generateSpeech(
          speechParams,
          { split: false, text },
          { fallback: t('error'), queryClient, signal, translateErrorCode },
        );
        setAudioURL(url);
        toast.success(t('success'));
      } catch (error) {
        if (!signal.aborted) {
          toast.error(speechErrorMessage(error, t('error')));
        }
      }
    });
  };

  const handleRetrySegment = (index: number) => {
    if (isGenerating) return;
    return run((signal) => split.retry(index, signal));
  };

  const handleCancel = () => {
    setIsGenerating(false);
    abortController.current?.abort();
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: textarea should resize when text or fullscreen changes
  useEffect(() => {
    if (textareaRef.current && !isFullscreen) {
      resizeTextarea(textareaRef.current, 6);
    }
  }, [text, isFullscreen]);

  // An estimate shows only while the request it priced is unchanged.
  const estimateKey = speechParams
    ? JSON.stringify({
        styleVariant: speechRequestFields(speechParams).styleVariant,
        texts: split.active
          ? split.segments.map((segment) => segment.text)
          : [text],
        voiceId: speechParams.voiceId,
      })
    : '';
  const estimatedCredits =
    estimate?.key === estimateKey ? estimate.credits : null;

  const handleEstimateCredits = async () => {
    if (!(speechParams && canEstimateCredits && text.trim())) return;

    setIsEstimating(true);
    try {
      const credits = split.active
        ? await split.estimate()
        : await estimateSpeech(speechParams, text, {
            fallback: t('errorEstimating'),
            translateErrorCode,
          });
      setEstimate({ credits, key: estimateKey });
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
              enforceCharactersLimit={!splitEnabled}
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
                split.active
                  ? t('split.characterCount', {
                      characters: text.length,
                      segments: split.segmentCount,
                    })
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
              textareaMaxLength={splitEnabled ? null : undefined}
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
              ctaText={split.active ? t('ctaButtonPlural') : t('ctaButton')}
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
            {!split.active && audioURL && (
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
        {split.active && (
          <SplitSegmentsPanel
            isGenerating={isGenerating}
            onDownloadSegment={downloadAudio}
            onRetrySegment={handleRetrySegment}
            split={split}
          />
        )}
      </CardContent>
    </Card>
  );
}
