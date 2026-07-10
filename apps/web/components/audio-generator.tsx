'use client';

import { useCompletion } from '@ai-sdk/react';
import { CircleStop, Download, Loader2, RotateCcw } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
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
import {
  estimateTokenCount,
  GEMINI_CHARS_PER_TOKEN,
  GEMINI_STREAMING_ENABLED,
  getCharactersLimit,
  getGeminiCombinedTokenLimit,
  getGeminiStyleCharacterLimit,
} from '@/lib/ai';
import { downloadUrl } from '@/lib/download';
import { APIError } from '@/lib/error-ts';
import { resizeTextarea } from '@/lib/react-textarea-autosize';
import { MAX_FREE_GENERATIONS } from '@/lib/supabase/constants';
import { cn, getTtsProvider } from '@/lib/utils';
import { useGenerationProgressToast } from './audio-generator/hooks/use-generation-progress-toast';
import { useSplitSegments } from './audio-generator/hooks/use-split-segments';
import { useStreamingWaveformPlayer } from './audio-generator/hooks/use-streaming-waveform-player';
import { SplitSegmentsPanel } from './audio-generator/split-segments-panel';
import {
  generateRetrySeed,
  SPLIT_SEGMENT_MAX_COUNT,
  splitLongTextIntoSegments,
} from './audio-generator/split-segments-utils';
import {
  type AudioPlayerControls,
  AudioPlayerWithContext,
} from './audio-player-with-context';
import { GenerateButton } from './generate-button';
import { StreamingWaveformPlayer } from './streaming-waveform-player';

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

const STREAM_TEXT_THRESHOLD = 300;

// ── SSE client parser ─────────────────────────────────────────────────────
interface SseAudioEvent {
  data: string;
  mimeType: string;
}

interface SseDoneEvent {
  cached?: boolean;
  creditsRemaining: number;
  creditsUsed: number;
  url: string;
}

interface SseErrorEvent {
  error: string;
}

interface ParseSseStreamCallbacks {
  onAudio: (event: SseAudioEvent) => void;
  onDone: (event: SseDoneEvent) => void;
  onError: (event: SseErrorEvent) => void;
}

async function parseSseStream(
  response: Response,
  callbacks: ParseSseStreamCallbacks,
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE blocks (separated by blank lines)
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? ''; // last incomplete block stays in buffer

      for (const block of blocks) {
        const lines = block.split('\n');
        let eventType = '';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            dataStr = line.slice(6).trim();
          }
        }

        if (!(eventType && dataStr)) continue;

        try {
          const payload = JSON.parse(dataStr);
          if (eventType === 'audio') {
            callbacks.onAudio(payload as SseAudioEvent);
          } else if (eventType === 'done') {
            callbacks.onDone(payload as SseDoneEvent);
          } else if (eventType === 'error') {
            callbacks.onError(payload as SseErrorEvent);
          }
        } catch {
          // malformed JSON — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

interface AudioGeneratorProps {
  hasEnoughCredits: boolean;
  isPaidUser: boolean;
  selectedStyle?: string;
  selectedVoice?: Tables<'voices'>;
  settings?: GenerationSettings;
}

type GenerateTranslator = ReturnType<typeof useTranslations<'generate'>>;

function throwGenerateVoiceError(
  t: GenerateTranslator,
  data: {
    error?: string;
    errorCode?: string;
    serverMessage?: string;
  },
  response: Response,
): never {
  if (data.errorCode) {
    const messageKey = data.errorCode as Parameters<typeof t>[0];
    if (t.has(messageKey)) {
      const errorMessage = t(messageKey);
      throw new APIError(
        errorMessage.replace('__COUNT__', MAX_FREE_GENERATIONS.toString()),
        response,
      );
    }
  }

  throw new APIError(data.error || data.serverMessage || t('error'), response);
}

function handleGenerateVoiceError(t: GenerateTranslator, error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return;
  }

  if (error instanceof APIError) {
    toast.error(error.message || t('error'));
    return;
  }

  toast.error(t('error'));
}

export function AudioGenerator({
  hasEnoughCredits,
  isPaidUser,
  selectedStyle,
  selectedVoice,
  settings = DEFAULT_GENERATION_SETTINGS,
}: AudioGeneratorProps) {
  const t = useTranslations('generate');
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

  // Live waveform + Web Audio engine for the gpro31 streaming path. The methods
  // are stable (useCallback); destructure them for use in memoized callbacks.
  const streamingPlayer = useStreamingWaveformPlayer();
  const {
    pushChunk: pushStreamChunk,
    finalize: finalizeStream,
    reset: resetStream,
  } = streamingPlayer;

  const audio = useAudio();
  const {
    join: joinSegments,
    isProcessing: isJoiningSegments,
    isLoading: isJoinerLoading,
  } = useFFmpegJoiner();

  const provider = getTtsProvider(selectedVoice?.model);
  const isGeminiVoice = provider === 'gemini';
  const isGrokVoice = provider === 'grok';
  // Only gemini-3.1 (gpro31) returns audio progressively. The 2.5 models
  // synthesize the whole clip and return it in a single chunk, so streaming
  // there gives no time-to-first-audio benefit — keep them on the JSON path.
  // HOTFIX: gated behind GEMINI_STREAMING_ENABLED (currently false) because
  // progressive streaming corrupted some gpro31 generations.
  const isStreamingModel =
    GEMINI_STREAMING_ENABLED && selectedVoice?.model === 'gpro31';
  // Rough speech-rate estimate (~15 chars/sec) so the streaming waveform fills
  // toward the expected total length before the exact duration is known.
  const estimatedStreamDurationSec = Math.max(1, Math.round(text.length / 15));
  const showEnhanceButton =
    provider === 'replicate' ||
    (provider === 'gemini' && selectedVoice?.model === 'gpro31');
  const canEstimateCredits = isGeminiVoice || isGrokVoice;

  // Gemini 3.1 (gpro31) shares one combined token budget between the transcript
  // and the style, so its transcript "character limit" is that token budget
  // expressed in approximate characters. Other voices keep the per-tier cap.
  // HOTFIX: while streaming is disabled (GEMINI_STREAMING_ENABLED === false)
  // gpro31 reverts to the standard per-tier character limits and the separate
  // style-prompt cap, like the Gemini 2.5 voices.
  const isGemini31 =
    GEMINI_STREAMING_ENABLED &&
    isGeminiVoice &&
    selectedVoice?.model === 'gpro31';
  const styleText = isGeminiVoice ? (selectedStyle ?? '') : '';
  const charactersLimit = isGemini31
    ? getGeminiCombinedTokenLimit(isPaidUser) * GEMINI_CHARS_PER_TOKEN
    : getCharactersLimit(selectedVoice?.model || '', isPaidUser);
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
  // Gemini 2.5 voices have a separate character-bounded style prompt; gpro31
  // folds the style into the combined token budget checked below.
  const styleCharacterLimit = getGeminiStyleCharacterLimit(isPaidUser);
  const styleIsOverLimit =
    isGeminiVoice && !isGemini31 && styleText.length > styleCharacterLimit;
  const combinedTokenLimit = getGeminiCombinedTokenLimit(isPaidUser);
  const combinedTokenEstimate = isGemini31
    ? estimateTokenCount(styleText ? `${styleText}\n${text}` : text)
    : 0;
  const combinedIsOverLimit =
    isGemini31 && combinedTokenEstimate > combinedTokenLimit;
  const textIsOverLimit =
    !shouldDisableCharactersLimit &&
    (isGemini31 ? combinedIsOverLimit : text.length > charactersLimit);
  // Any input limit (transcript, style, or combined token budget) blocks generation.
  const inputIsOverLimit = textIsOverLimit || styleIsOverLimit;
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
    text,
    shouldUseSplitMode,
    splitSegmentTexts: previewSplitSegmentTexts,
  });
  const { showGenerationProgressToast, dismissGenerationProgressToast } =
    useGenerationProgressToast(selectedVoice?.name);

  let textareaRightPadding = 'pr-16';

  if (isGeminiVoice) {
    textareaRightPadding = 'pr-10';
  } else if (showEnhanceButton) {
    textareaRightPadding = 'pr-20';
  }

  const requestGenerateVoiceJson = useCallback(
    async (
      segmentText: string,
      signal: AbortSignal,
      seed?: number,
      split = false,
    ): Promise<string> => {
      if (!selectedVoice) {
        throw new APIError(t('error'), new Response(null, { status: 400 }));
      }

      // An explicit seed argument (e.g. a segment retry re-roll) wins; otherwise
      // fall back to the user's pinned seed — but only for Gemini, which is the
      // only provider that uses it. Sending it on Grok/Replicate would do
      // nothing but fragment their cache and force needless regenerations.
      const effectiveSeed =
        seed ?? (isGeminiVoice ? (settings.seed ?? undefined) : undefined);

      const response = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: segmentText,
          voiceId: selectedVoice.id,
          styleVariant: isGeminiVoice ? selectedStyle : '',
          language: isGrokVoice ? selectedGrokLanguage : undefined,
          ...(effectiveSeed === undefined ? {} : { seed: effectiveSeed }),
          ...(isGeminiVoice && settings.temperature !== null
            ? { temperature: settings.temperature }
            : {}),
          ...(isGrokVoice && settings.speed !== null
            ? { speed: settings.speed }
            : {}),
          split,
        }),
        signal,
      });

      const data = await response.json();
      if (!response.ok) {
        throwGenerateVoiceError(t, data, response);
      }

      return data.url as string;
    },
    [
      t,
      isGeminiVoice,
      isGrokVoice,
      selectedGrokLanguage,
      selectedStyle,
      selectedVoice,
      settings.seed,
      settings.speed,
      settings.temperature,
    ],
  );

  const requestGenerateVoiceStream = useCallback(
    async (segmentText: string, signal: AbortSignal): Promise<string> => {
      if (!selectedVoice) {
        throw new APIError(t('error'), new Response(null, { status: 400 }));
      }

      const response = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: segmentText,
          voiceId: selectedVoice.id,
          styleVariant: selectedStyle ?? '',
          stream: true,
          ...(settings.seed === null ? {} : { seed: settings.seed }),
          ...(settings.temperature === null
            ? {}
            : { temperature: settings.temperature }),
        }),
        signal,
      });

      if (!response.ok) {
        const data = await response.json();
        throwGenerateVoiceError(t, data, response);
      }

      // The streaming player owns the Web Audio engine, peak accumulation, and
      // the live→file handoff. Here we just feed it PCM chunks as they arrive.
      return new Promise<string>((resolve, reject) => {
        parseSseStream(response, {
          onAudio: ({ data, mimeType }) => {
            if (signal.aborted) return;
            pushStreamChunk(data, mimeType);
          },
          onDone: ({ url }) => {
            // Assemble the WAV and arrange the handoff; live playback continues
            // until the buffered tail finishes (see the hook). A cache hit sends
            // no audio chunks, so `finalize` is a no-op and the standard file
            // player handles the persisted URL instead.
            finalizeStream();
            resolve(url);
          },
          onError: ({ error }) => {
            resetStream();
            reject(new APIError(error, new Response(null, { status: 500 })));
          },
        }).catch(reject);
      });
    },
    [
      t,
      finalizeStream,
      pushStreamChunk,
      resetStream,
      selectedStyle,
      selectedVoice,
      settings.seed,
      settings.temperature,
    ],
  );

  const requestGenerateVoice = useCallback(
    (
      segmentText: string,
      signal: AbortSignal,
      seed?: number,
      split = false,
    ): Promise<string> => {
      // `auto` keeps the length-based heuristic; `on`/`off` are explicit
      // overrides. Streaming only applies to gpro31 in the non-split path.
      let shouldStream = segmentText.length > STREAM_TEXT_THRESHOLD;
      if (settings.streamMode === 'on') {
        shouldStream = true;
      } else if (settings.streamMode === 'off') {
        shouldStream = false;
      }
      const useStream =
        isGeminiVoice &&
        isStreamingModel &&
        !shouldUseSplitMode &&
        shouldStream;

      if (useStream) {
        return requestGenerateVoiceStream(segmentText, signal);
      }
      return requestGenerateVoiceJson(segmentText, signal, seed, split);
    },
    [
      isGeminiVoice,
      isStreamingModel,
      requestGenerateVoiceJson,
      requestGenerateVoiceStream,
      shouldUseSplitMode,
      settings.streamMode,
    ],
  );

  const generateSingleAudio = useCallback(async () => {
    if (!selectedVoice) return;

    abortController.current = new AbortController();
    const url = await requestGenerateVoice(
      text,
      abortController.current.signal,
    );
    setAudioURL(url);
    toast.success(t('success'));
  }, [requestGenerateVoice, selectedVoice, text]);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential fail-fast flow
  const generateSplitAudios = useCallback(async () => {
    if (!(selectedVoice && splitSegments.length > 0)) return;

    const currentSegmentTexts = splitSegments.map((segment) =>
      segment.text.trim(),
    );
    if (currentSegmentTexts.some((segmentText) => !segmentText)) {
      toast.error(t('split.segmentCannotBeEmpty'));
      return;
    }

    abortController.current = new AbortController();
    setAudioURL('');

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
          ? { ...segment, status: 'generating', audioUrl: '' }
          : segment,
      );
      markSegmentGenerating(index);
      const isLastPendingSegment = pendingProgressIndex === pendingSegmentCount;
      if (showProgress) {
        showGenerationProgressToast(pendingProgressIndex, pendingSegmentCount);
      }

      try {
        const generatedUrl = await requestGenerateVoice(
          currentSegmentTexts[index],
          abortController.current.signal,
          undefined,
          true,
        );

        latestSegments = latestSegments.map((segment, segmentIndex) =>
          segmentIndex === index
            ? { ...segment, status: 'success', audioUrl: generatedUrl }
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
          toast.error(error.message || t('error'));
        } else {
          toast.error(
            t('split.segmentFailed').replace('__INDEX__', String(index + 1)),
          );
        }

        encounteredFailure = true;
        break;
      }
    }

    if (!encounteredFailure) {
      toast.success(t('success'));
    }
  }, [
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

    setIsGenerating(true);
    // Clear any previous result/streaming player before a new generation.
    setAudioURL('');
    resetStream();
    try {
      if (shouldUseSplitMode) {
        await generateSplitAudios();
        return;
      }

      await generateSingleAudio();
    } catch (error) {
      handleGenerateVoiceError(t, error);
    } finally {
      dismissGenerationProgressToast();
      setIsGenerating(false);
    }
  }, [
    dismissGenerationProgressToast,
    generateSingleAudio,
    generateSplitAudios,
    resetStream,
    selectedVoice,
    shouldUseSplitMode,
    splitSegmentTexts.length,
  ]);

  const handleCancel = useCallback(() => {
    setIsGenerating(false);
    abortController.current?.abort();
    retryAbortController.current?.abort();
    resetStream();
  }, [resetStream]);

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
          true,
        );

        markSegmentSuccess(segmentIndex, segment.text, generatedUrl);
        showGenerationProgressToast(
          segmentIndex + 1,
          splitSegments.length,
          true,
        );
        toast.success(
          t('split.segmentGenerated').replace(
            '__INDEX__',
            String(segmentIndex + 1),
          ),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          markSegmentIdle(segmentIndex);
          return;
        }

        markSegmentFailed(segmentIndex);
        if (error instanceof APIError) {
          toast.error(error.message || t('error'));
        } else {
          toast.error(
            t('split.segmentRetryFailed').replace(
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
      dismissGenerationProgressToast,
      isGenerating,
      markSegmentFailed,
      markSegmentGenerating,
      markSegmentIdle,
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
          !inputIsOverLimit
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
    inputIsOverLimit,
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
    try {
      await downloadUrl(segmentUrl, document.createElement('a'));
    } catch {
      toast.error(t('error'));
    }
  };

  const downloadAudio = async () => {
    if (!audioURL) return;

    try {
      await downloadUrl(audioURL, document.createElement('a'));
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
          file,
          startSec: 0,
          endSec: durationSec,
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

    setIsEnhancingText(true);
    setPreviousText(text);

    try {
      const enhancedText = await complete(text, {
        body: {
          selectedVoiceLanguage: selectedVoice.language,
          ttsProvider: provider,
          voiceModel: selectedVoice.model,
        },
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
          t('errorEstimating'),
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
          voiceId: selectedVoice.id,
          styleVariant: isGeminiVoice ? selectedStyle : '',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new APIError(data.error || t('error'), response);
      }

      const value = Number(data.estimatedCredits);
      if (!Number.isFinite(value)) {
        throw new APIError(t('errorEstimating'), response);
      }

      return value;
    },
    [canEstimateCredits, isGeminiVoice, selectedStyle, selectedVoice],
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
        toast.error(error.message || t('error'));
      } else {
        toast.error(t('errorEstimating'));
      }
    } finally {
      setIsEstimating(false);
    }
  };

  return (
    <Card data-testid="audio-generator-card">
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6 sm:pt-4">
        <div className="space-y-2">
          {isGrokVoice ? (
            <GrokTTSEditor
              charactersLimit={charactersLimit}
              enforceCharactersLimit={!shouldDisableCharactersLimit}
              isPaidUser={isPaidUser}
              onChange={setText}
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
              onTextChange={setText}
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
            {!shouldUseSplitMode && streamingPlayer.phase !== 'idle' && (
              <>
                <StreamingWaveformPlayer
                  className="rounded-md"
                  controller={streamingPlayer}
                  estimatedDurationSec={estimatedStreamDurationSec}
                  onControlsReady={handleControlsReady}
                  playAudioTitle={t('playAudio')}
                  progressColor="#8b5cf6"
                  waveColor="#888888"
                  waveformClassName="w-48"
                />
                {streamingPlayer.phase === 'file' && (
                  <>
                    <Button
                      onClick={resetPlayer}
                      size="icon"
                      title={t('resetPlayer')}
                      variant="secondary"
                    >
                      <RotateCcw className="size-6" />
                    </Button>
                    <Button
                      onClick={downloadAudio}
                      size="icon"
                      title={t('downloadAudio')}
                      variant="secondary"
                    >
                      <Download className="size-6" />
                    </Button>
                  </>
                )}
              </>
            )}
            {!shouldUseSplitMode &&
              streamingPlayer.phase === 'idle' &&
              audioURL && (
                <>
                  <AudioPlayerWithContext
                    autoPlay
                    className="rounded-md"
                    onControlsReady={handleControlsReady}
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
                    onClick={downloadAudio}
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
