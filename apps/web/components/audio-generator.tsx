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

const STREAM_TEXT_THRESHOLD = 300;

// ── PCM → Float32 conversion ─────────────────────────────────────────────
function pcmToFloat32(buffer: ArrayBuffer): Float32Array<ArrayBuffer> {
  const int16 = new Int16Array(buffer);
  const float32 = new Float32Array(int16.length) as Float32Array<ArrayBuffer>;
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32_768.0;
  }
  return float32;
}

function parseSampleRate(mimeType: string): number {
  const match = mimeType.match(/rate=(\d+)/);
  return match ? Number.parseInt(match[1], 10) : 24_000;
}

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
  dict: (typeof messages)['generate'];
  hasEnoughCredits: boolean;
  isPaidUser: boolean;
  selectedStyle?: string;
  selectedVoice?: Tables<'voices'>;
}

function throwGenerateVoiceError(
  dict: (typeof messages)['generate'],
  data: {
    error?: string;
    errorCode?: string;
    serverMessage?: string;
  },
  response: Response,
): never {
  if (data.errorCode && dict[data.errorCode as keyof typeof dict]) {
    const errorMessage = dict[data.errorCode as keyof typeof dict] as string;
    throw new APIError(
      errorMessage.replace('__COUNT__', MAX_FREE_GENERATIONS.toString()),
      response,
    );
  }

  throw new APIError(data.error || data.serverMessage || dict.error, response);
}

function handleGenerateVoiceError(
  dict: (typeof messages)['generate'],
  error: unknown,
) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return;
  }

  if (error instanceof APIError) {
    toast.error(error.message || dict.error);
    return;
  }

  toast.error(dict.error);
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
  const [isStreamingAudio, setIsStreamingAudio] = useState(false);
  // True when the just-finished generation was played live via the streaming
  // path, so the persisted-file player must NOT auto-play (avoids double audio).
  const [didStreamPlayback, setDidStreamPlayback] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const retryAbortController = useRef<AbortController | null>(null);
  const streamingAudioContextRef = useRef<AudioContext | null>(null);
  const streamingSourcesRef = useRef<AudioBufferSourceNode[]>([]);

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
  const isStreamingModel = selectedVoice?.model === 'gpro31';
  const showEnhanceButton =
    provider === 'replicate' ||
    (provider === 'gemini' && selectedVoice?.model === 'gpro31');
  const canEstimateCredits = isGeminiVoice || isGrokVoice;

  const charactersLimit = getCharactersLimit(
    selectedVoice?.model || '',
    isPaidUser,
  );
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
    !shouldDisableCharactersLimit && text.length > charactersLimit;
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
    useGenerationProgressToast(selectedVoice?.name, dict.split);

  let textareaRightPadding = 'pr-16';

  if (isGeminiVoice) {
    textareaRightPadding = 'pr-10';
  } else if (showEnhanceButton) {
    textareaRightPadding = 'pr-20';
  }

  const stopStreamingAudio = useCallback(() => {
    for (const source of streamingSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // source may already be stopped
      }
    }
    streamingSourcesRef.current = [];
    try {
      streamingAudioContextRef.current?.close();
    } catch {
      // already closed
    }
    streamingAudioContextRef.current = null;
    setIsStreamingAudio(false);
  }, []);

  const requestGenerateVoiceJson = useCallback(
    async (
      segmentText: string,
      signal: AbortSignal,
      seed?: number,
    ): Promise<string> => {
      if (!selectedVoice) {
        throw new APIError(dict.error, new Response(null, { status: 400 }));
      }

      const response = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: segmentText,
          voiceId: selectedVoice.id,
          styleVariant: isGeminiVoice ? selectedStyle : '',
          language: isGrokVoice ? selectedGrokLanguage : undefined,
          ...(seed === undefined ? {} : { seed }),
        }),
        signal,
      });

      const data = await response.json();
      if (!response.ok) {
        throwGenerateVoiceError(dict, data, response);
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

  const requestGenerateVoiceStream = useCallback(
    async (segmentText: string, signal: AbortSignal): Promise<string> => {
      if (!selectedVoice) {
        throw new APIError(dict.error, new Response(null, { status: 400 }));
      }

      const response = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: segmentText,
          voiceId: selectedVoice.id,
          styleVariant: selectedStyle ?? '',
          stream: true,
        }),
        signal,
      });

      if (!response.ok) {
        const data = await response.json();
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

      // Set up AudioContext for real-time PCM playback.
      const sampleRate = 24_000;
      const audioCtx = new AudioContext({ sampleRate });
      streamingAudioContextRef.current = audioCtx;
      streamingSourcesRef.current = [];
      // The context is created after `await fetch(...)`, i.e. outside the
      // original click handler, so browsers start it in the `suspended` state.
      // Without resuming, `currentTime` never advances and scheduled chunks
      // are silently dropped — explicitly resume before scheduling anything.
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      let nextStartTime = audioCtx.currentTime;
      setIsStreamingAudio(true);

      const schedulePcmChunk = (samples: Float32Array<ArrayBuffer>) => {
        const audioBuffer = audioCtx.createBuffer(
          1,
          samples.length,
          sampleRate,
        );
        audioBuffer.copyToChannel(samples, 0);

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);

        const startAt = Math.max(audioCtx.currentTime, nextStartTime);
        source.start(startAt);
        nextStartTime = startAt + audioBuffer.duration;
        streamingSourcesRef.current.push(source);
      };

      return new Promise<string>((resolve, reject) => {
        parseSseStream(response, {
          onAudio: ({ data, mimeType }) => {
            if (signal.aborted) return;
            try {
              // Use atob for browser-compatible base64 decoding
              const binaryStr = atob(data);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              const rawBuffer = bytes.buffer as ArrayBuffer;
              const chunkSampleRate = parseSampleRate(mimeType);
              // Re-create context if sample rate differs from first chunk
              if (
                chunkSampleRate !== sampleRate &&
                streamingAudioContextRef.current
              ) {
                // keep playing at original rate; re-sampling not needed for typical TTS
              }
              const samples = pcmToFloat32(rawBuffer);
              schedulePcmChunk(samples);
              // Real audio played live → suppress the player's auto-play later.
              // (A cache hit sends only a `done` event with no audio chunks,
              // so this stays false and the player auto-plays the cached file.)
              setDidStreamPlayback(true);
            } catch {
              // non-fatal: skip malformed chunk
            }
          },
          onDone: ({ url }) => {
            // `done` arrives after the upload finishes, but PCM chunks are
            // scheduled ahead of real time and may still be playing. Keep the
            // streaming state (and its Stop control) alive until the last
            // buffered chunk actually ends.
            const remainingMs = Math.max(
              0,
              (nextStartTime - audioCtx.currentTime) * 1000,
            );
            window.setTimeout(() => {
              setIsStreamingAudio(false);
            }, remainingMs);
            resolve(url);
          },
          onError: ({ error }) => {
            stopStreamingAudio();
            reject(new APIError(error, new Response(null, { status: 500 })));
          },
        }).catch(reject);
      });
    },
    [dict, selectedStyle, selectedVoice, stopStreamingAudio],
  );

  const requestGenerateVoice = useCallback(
    (
      segmentText: string,
      signal: AbortSignal,
      seed?: number,
    ): Promise<string> => {
      const useStream =
        isGeminiVoice &&
        isStreamingModel &&
        !shouldUseSplitMode &&
        segmentText.length > STREAM_TEXT_THRESHOLD;

      if (useStream) {
        return requestGenerateVoiceStream(segmentText, signal);
      }
      return requestGenerateVoiceJson(segmentText, signal, seed);
    },
    [
      isGeminiVoice,
      isStreamingModel,
      requestGenerateVoiceJson,
      requestGenerateVoiceStream,
      shouldUseSplitMode,
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

    if (
      shouldUseSplitMode &&
      splitSegmentTexts.length > SPLIT_SEGMENT_MAX_COUNT
    ) {
      toast.error(
        dict.split.tooManySegments.replace(
          '__COUNT__',
          String(SPLIT_SEGMENT_MAX_COUNT),
        ),
      );
      return;
    }

    setIsGenerating(true);
    setDidStreamPlayback(false);
    try {
      if (shouldUseSplitMode) {
        await generateSplitAudios();
        return;
      }

      await generateSingleAudio();
    } catch (error) {
      handleGenerateVoiceError(dict, error);
    } finally {
      dismissGenerationProgressToast();
      setIsGenerating(false);
    }
  }, [
    dict.error,
    dict.split.tooManySegments,
    dismissGenerationProgressToast,
    generateSingleAudio,
    generateSplitAudios,
    selectedVoice,
    shouldUseSplitMode,
    splitSegmentTexts.length,
  ]);

  const handleCancel = useCallback(() => {
    setIsGenerating(false);
    abortController.current?.abort();
    retryAbortController.current?.abort();
    stopStreamingAudio();
  }, [stopStreamingAudio]);

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
        if (error instanceof DOMException && error.name === 'AbortError') {
          markSegmentIdle(segmentIndex);
          return;
        }

        markSegmentFailed(segmentIndex);
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
    try {
      await downloadUrl(segmentUrl, document.createElement('a'));
    } catch {
      toast.error(dict.error);
    }
  };

  const downloadAudio = async () => {
    if (!audioURL) return;

    try {
      await downloadUrl(audioURL, document.createElement('a'));
    } catch {
      toast.error(dict.error);
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
          voiceId: selectedVoice.id,
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
    <Card data-testid="audio-generator-card">
      <CardHeader>
        <CardTitle>{dict.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6 sm:pt-4">
        <div className="space-y-2">
          {isGrokVoice ? (
            <GrokTTSEditor
              characterLimitPaidTooltip={dict.paidCharacterLimitTooltip}
              characterLimitUpgradeTooltip={dict.upgradeCharacterLimitTooltip}
              charactersLimit={charactersLimit}
              dict={dict.grok}
              enforceCharactersLimit={!shouldDisableCharactersLimit}
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
              ctaText={
                shouldUseSplitMode ? dict.ctaButtonPlural : dict.ctaButton
              }
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
            {!isGenerating && isStreamingAudio && (
              <Button
                aria-label={dict.cancel}
                className="cursor-pointer border-none p-0 text-gray-300 hover:bg-transparent hover:text-white"
                icon={() => <CircleStop className="size-8!" name="stop" />}
                iconPlacement="right"
                onClick={stopStreamingAudio}
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
                  autoPlay={!didStreamPlayback}
                  className="rounded-md"
                  onControlsReady={handleControlsReady}
                  onPlaybackStart={stopStreamingAudio}
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
