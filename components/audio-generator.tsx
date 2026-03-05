'use client';

import { useCompletion } from '@ai-sdk/react';
import {
  CheckCircle2,
  CircleStop,
  Crown,
  Download,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExternalToast } from 'sonner';

import { useAudio } from '@/app/[lang]/(dashboard)/dashboard/clone/audio-provider';
import { useFFmpegJoiner } from '@/app/[lang]/tools/audio-joiner/hooks/use-ffmpeg-joiner';
import { toast } from '@/components/services/toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getCharactersLimit } from '@/lib/ai';
import { downloadUrl } from '@/lib/download';
import { APIError } from '@/lib/error-ts';
import type lang from '@/lib/i18n/dictionaries/en.json';
import { resizeTextarea } from '@/lib/react-textarea-autosize';
import { MAX_FREE_GENERATIONS } from '@/lib/supabase/constants';
import { cn } from '@/lib/utils';
import {
  type AudioPlayerControls,
  AudioPlayerWithContext,
} from './audio-player-with-context';
import PulsatingDots from './PulsatingDots';
import { Alert, AlertDescription } from './ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

interface AudioGeneratorProps {
  selectedVoice?: Tables<'voices'>;
  selectedStyle?: string;
  hasEnoughCredits: boolean;
  isPaidUser: boolean;
  dict: (typeof lang)['generate'];
  locale: string;
}

const SPLIT_TEXT_MIN_LENGTH = 500;
const SPLIT_SEGMENT_MAX_LENGTH = 500;
const SPLIT_STORAGE_PREFIX = 'generate-split-segments-v1';

type SplitSegmentStatus = 'idle' | 'generating' | 'success' | 'failed';

interface SplitSegmentItem {
  id: string;
  text: string;
  status: SplitSegmentStatus;
  audioUrl: string;
}

interface PersistedSplitSegments {
  segments: Array<{
    text: string;
    status: SplitSegmentStatus;
    audioUrl?: string;
  }>;
  generatedByText?: Record<string, string>;
}

function buildSplitStorageKey(voiceName: string, text: string): string {
  return `${SPLIT_STORAGE_PREFIX}:${voiceName}:${text}`;
}

function splitLongTextIntoSegments(text: string): string[] {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return [];
  }

  const sentenceLikeChunks = trimmedText
    .split('.')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index, array) =>
      index < array.length - 1 || trimmedText.endsWith('.')
        ? `${chunk}.`
        : chunk,
    );

  const segments: string[] = [];
  let currentSegment = '';

  const pushCurrentSegment = () => {
    const cleaned = currentSegment.trim();
    if (cleaned) {
      segments.push(cleaned);
    }
    currentSegment = '';
  };

  for (const sentence of sentenceLikeChunks) {
    const candidate = currentSegment
      ? `${currentSegment} ${sentence}`.trim()
      : sentence;

    if (candidate.length <= SPLIT_SEGMENT_MAX_LENGTH) {
      currentSegment = candidate;
      continue;
    }

    if (currentSegment) {
      pushCurrentSegment();
    }

    if (sentence.length <= SPLIT_SEGMENT_MAX_LENGTH) {
      currentSegment = sentence;
      continue;
    }

    let remaining = sentence;
    while (remaining.length > SPLIT_SEGMENT_MAX_LENGTH) {
      segments.push(remaining.slice(0, SPLIT_SEGMENT_MAX_LENGTH).trim());
      remaining = remaining.slice(SPLIT_SEGMENT_MAX_LENGTH).trim();
    }

    currentSegment = remaining;
  }

  pushCurrentSegment();
  return segments;
}

function getSplitSegmentStatusLabel(status: SplitSegmentStatus): string {
  switch (status) {
    case 'success':
      return 'Generated';
    case 'generating':
      return 'Generating...';
    case 'failed':
      return 'Failed';
    default:
      return 'Pending';
  }
}

function generateRetrySeed(): number {
  return Math.floor(1_000_000 + Math.random() * 9_000_000);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI orchestration
export function AudioGenerator({
  selectedVoice,
  selectedStyle,
  hasEnoughCredits,
  isPaidUser,
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
  const [splitTextAudios, setSplitTextAudios] = useState(false);
  const [splitSegments, setSplitSegments] = useState<SplitSegmentItem[]>([]);
  const [splitGeneratedByText, setSplitGeneratedByText] = useState<
    Record<string, string>
  >({});
  const [isDownloadingAllSegments, setIsDownloadingAllSegments] =
    useState(false);
  const [playerControls, setPlayerControls] =
    useState<AudioPlayerControls | null>(null);

  const audio = useAudio();
  const isGeminiVoice = selectedVoice?.model === 'gpro';
  const charactersLimit = useMemo(
    () => getCharactersLimit(selectedVoice?.model || '', isPaidUser),
    [selectedVoice, isPaidUser],
  );
  const {
    join: joinSegments,
    isProcessing: isJoiningSegments,
    isLoading: isJoinerLoading,
  } = useFFmpegJoiner();
  const abortController = useRef<AbortController | null>(null);
  const generationToastIdRef = useRef<ExternalToast['id'] | null>(null);
  const textIsOverLimit = text.length > charactersLimit;
  const splitFeatureVisible = text.trim().length > SPLIT_TEXT_MIN_LENGTH;
  const shouldUseSplitMode =
    isPaidUser && splitFeatureVisible && splitTextAudios;
  const splitSegmentTexts = useMemo(
    () => splitLongTextIntoSegments(text),
    [text],
  );
  const splitStorageKey = useMemo(() => {
    if (!(selectedVoice?.name && text.trim())) {
      return '';
    }
    return buildSplitStorageKey(selectedVoice.name, text);
  }, [selectedVoice?.name, text]);
  const allSegmentsGenerated =
    splitSegments.length > 0 &&
    splitSegments.every(
      (segment) => segment.status === 'success' && Boolean(segment.audioUrl),
    );
  const showGenerationProgressToast = useCallback(
    (segmentIndex: number, totalSegments: number) => {
      const safeTotal = Math.max(1, totalSegments);
      const progressPercent = Math.round((segmentIndex / safeTotal) * 100);
      const title = selectedVoice?.name
        ? `${selectedVoice.name} generation`
        : 'Audio generation';

      const toastId = toast.loading(
        <div className="w-[280px] space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <span>{title}</span>
          </div>
          <p className="text-sm">
            Segment {segmentIndex}/{safeTotal}
          </p>
          <div className="h-2 w-full rounded bg-muted">
            <div
              className="h-2 rounded bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-muted-foreground text-xs">{progressPercent}%</p>
        </div>,
        {
          duration: Number.POSITIVE_INFINITY,
          id: generationToastIdRef.current || undefined,
        },
      );

      generationToastIdRef.current = toastId;
    },
    [selectedVoice?.name],
  );

  const dismissGenerationProgressToast = useCallback(() => {
    if (!generationToastIdRef.current) {
      return;
    }

    toast.dismiss(generationToastIdRef.current);
    generationToastIdRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      dismissGenerationProgressToast();
    };
  }, [dismissGenerationProgressToast]);

  useEffect(() => {
    // Check if running on Mac for keyboard shortcut display
    const isMac =
      navigator.platform.toUpperCase().indexOf('MAC') >= 0 ||
      navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
    setShortcutKey(isMac ? '⌘+Enter' : 'Ctrl+Enter');
  }, []);

  useEffect(() => {
    if (!splitFeatureVisible) {
      setSplitTextAudios(false);
    }
  }, [splitFeatureVisible]);

  useEffect(() => {
    if (!(shouldUseSplitMode && splitStorageKey)) {
      setSplitSegments([]);
      setSplitGeneratedByText({});
      return;
    }

    const baseSegments = splitSegmentTexts.map((segmentText, index) => ({
      id: `${index}-${segmentText.slice(0, 16)}`,
      text: segmentText,
      status: 'idle' as const,
      audioUrl: '',
    }));

    if (typeof window === 'undefined') {
      setSplitSegments(baseSegments);
      return;
    }

    try {
      const raw = window.localStorage.getItem(splitStorageKey);
      if (!raw) {
        setSplitSegments(baseSegments);
        setSplitGeneratedByText({});
        return;
      }

      const parsed = JSON.parse(raw) as PersistedSplitSegments;
      if (!parsed.segments || parsed.segments.length !== baseSegments.length) {
        setSplitSegments(baseSegments);
        setSplitGeneratedByText(parsed.generatedByText || {});
        return;
      }

      const generatedByText = parsed.generatedByText || {};

      const merged = baseSegments.map((segment, index) => {
        const persistedSegment = parsed.segments[index];
        if (!persistedSegment || persistedSegment.text !== segment.text) {
          const cachedUrl = generatedByText[segment.text];
          if (cachedUrl) {
            return {
              ...segment,
              status: 'success' as const,
              audioUrl: cachedUrl,
            };
          }
          return segment;
        }

        if (
          persistedSegment.status === 'success' &&
          persistedSegment.audioUrl
        ) {
          return {
            ...segment,
            status: 'success' as const,
            audioUrl: persistedSegment.audioUrl,
          };
        }

        const cachedUrl = generatedByText[segment.text];
        if (cachedUrl) {
          return {
            ...segment,
            status: 'success' as const,
            audioUrl: cachedUrl,
          };
        }

        return segment;
      });

      setSplitSegments(merged);
      setSplitGeneratedByText(generatedByText);
    } catch {
      setSplitSegments(baseSegments);
      setSplitGeneratedByText({});
    }
  }, [shouldUseSplitMode, splitStorageKey, splitSegmentTexts]);

  useEffect(() => {
    if (
      !(shouldUseSplitMode && splitStorageKey) ||
      typeof window === 'undefined'
    ) {
      return;
    }

    const payload: PersistedSplitSegments = {
      segments: splitSegments.map((segment) => ({
        text: segment.text,
        status: segment.status,
        audioUrl: segment.audioUrl || undefined,
      })),
      generatedByText: splitGeneratedByText,
    };

    window.localStorage.setItem(splitStorageKey, JSON.stringify(payload));
  }, [
    shouldUseSplitMode,
    splitStorageKey,
    splitSegments,
    splitGeneratedByText,
  ]);

  const requestGenerateVoice = useCallback(
    async (segmentText: string, signal: AbortSignal, seed?: number) => {
      if (!selectedVoice) {
        throw new APIError(dict.error, new Response(null, { status: 400 }));
      }

      const styleVariant = isGeminiVoice ? selectedStyle : '';
      const response = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: segmentText,
          voice: selectedVoice.name,
          styleVariant,
          ...(seed !== undefined ? { seed } : {}),
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
    [selectedVoice, isGeminiVoice, selectedStyle, dict.error, dict],
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
    selectedVoice,
    showGenerationProgressToast,
    requestGenerateVoice,
    text,
    dict.success,
  ]);

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sequential fail-fast flow
  const generateSplitAudios = useCallback(async () => {
    if (!(selectedVoice && splitSegments.length > 0)) return;

    const currentSegmentTexts = splitSegments.map((segment) =>
      segment.text.trim(),
    );
    if (currentSegmentTexts.some((segmentText) => !segmentText)) {
      toast.error('Segment text cannot be empty.');
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
      setSplitSegments(latestSegments);
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
        setSplitSegments(latestSegments);
        setSplitGeneratedByText((current) => ({
          ...current,
          [currentSegmentTexts[index]]: generatedUrl,
        }));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error;
        }

        latestSegments = latestSegments.map((segment, segmentIndex) =>
          segmentIndex === index ? { ...segment, status: 'failed' } : segment,
        );
        setSplitSegments(latestSegments);

        if (error instanceof APIError) {
          toast.error(error.message || dict.error);
        } else {
          toast.error(`Segment ${index + 1} failed. Generation stopped.`);
        }

        encounteredFailure = true;
        break;
      }
    }

    if (!encounteredFailure) {
      toast.success(dict.success);
    }
  }, [
    selectedVoice,
    splitSegments,
    requestGenerateVoice,
    showGenerationProgressToast,
    dict.error,
    dict.success,
  ]);

  const handleGenerate = async () => {
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
  };

  const handleCancel = () => {
    setIsGenerating(false);
    abortController.current?.abort();
  };

  const handleRetrySegment = useCallback(
    async (segmentIndex: number) => {
      const segment = splitSegments[segmentIndex];
      if (!segment || isGenerating || !selectedVoice) {
        return;
      }

      const seed = generateRetrySeed();
      abortController.current = new AbortController();

      setSplitSegments((current) =>
        current.map((item, index) =>
          index === segmentIndex
            ? { ...item, status: 'generating', audioUrl: '' }
            : item,
        ),
      );
      showGenerationProgressToast(segmentIndex + 1, splitSegments.length);

      try {
        const generatedUrl = await requestGenerateVoice(
          segment.text,
          abortController.current.signal,
          seed,
        );

        setSplitSegments((current) =>
          current.map((item, index) =>
            index === segmentIndex
              ? { ...item, status: 'success', audioUrl: generatedUrl }
              : item,
          ),
        );
        setSplitGeneratedByText((current) => ({
          ...current,
          [segment.text]: generatedUrl,
        }));
        toast.success(`Segment ${segmentIndex + 1} generated.`);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setSplitSegments((current) =>
          current.map((item, index) =>
            index === segmentIndex ? { ...item, status: 'failed' } : item,
          ),
        );

        if (error instanceof APIError) {
          toast.error(error.message || dict.error);
        } else {
          toast.error(`Segment ${segmentIndex + 1} retry failed.`);
        }
      } finally {
        dismissGenerationProgressToast();
      }
    },
    [
      splitSegments,
      isGenerating,
      selectedVoice,
      showGenerationProgressToast,
      requestGenerateVoice,
      dict.error,
      dismissGenerationProgressToast,
    ],
  );

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
    // Reset wavesurfer player if available (waveform mode)
    if (playerControls) {
      playerControls.reset();
      return;
    }

    // Fallback to audio provider reset (non-waveform mode)
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
    // Check if there's an audio URL to download
    if (!audioURL) return;

    // Prepare the anchor element once in a closure scope
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
        const duration = Number.isFinite(element.duration)
          ? element.duration
          : 0;
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
      setTimeout(() => URL.revokeObjectURL(outputUrl), 150);
    } catch {
      toast.error('Failed to download all segments as one WAV file.');
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleControlsReady = useCallback((controls: AudioPlayerControls) => {
    setPlayerControls(controls);
  }, []);

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

  const requestEstimateCredits = useCallback(
    async (textToEstimate: string) => {
      if (!(selectedVoice && isGeminiVoice)) {
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
          styleVariant: selectedStyle,
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
      selectedVoice,
      isGeminiVoice,
      selectedStyle,
      dict.error,
      dict.errorEstimating,
    ],
  );

  const handleEstimateCredits = async () => {
    if (!(selectedVoice && isGeminiVoice && text.trim())) return;

    setIsEstimating(true);
    try {
      if (shouldUseSplitMode) {
        let totalEstimatedCredits = 0;
        for (const segmentText of splitSegments.map(
          (segment) => segment.text,
        )) {
          totalEstimatedCredits += await requestEstimateCredits(segmentText);
        }
        setEstimatedCredits(totalEstimatedCredits);
      } else {
        const estimatedCredits = await requestEstimateCredits(text);
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
              disabled={isGenerating}
              maxLength={charactersLimit + 10}
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
            className={cn(
              'flex items-center justify-end gap-1.5 text-muted-foreground text-sm',
              [textIsOverLimit ? 'font-bold text-red-500' : ''],
            )}
          >
            {text.length} / {charactersLimit}
            <TooltipProvider>
              <Tooltip delayDuration={100} supportMobileTap>
                <TooltipTrigger asChild>
                  <Crown
                    className={cn('h-3.5 w-3.5 cursor-default', [
                      isPaidUser
                        ? 'text-yellow-400'
                        : 'text-muted-foreground/50',
                    ])}
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
          {splitFeatureVisible && (
            <div className="flex items-center justify-between rounded-lg border border-input border-dashed px-3 py-2">
              <Label
                className="cursor-pointer text-sm"
                htmlFor="split-text-audios"
              >
                Split text audios
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
          )}
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
            'grid grid-cols-1 justify-start gap-3 sm:grid-cols-[1fr_2fr]',
            hasEnoughCredits ? '' : 'flex flex-col items-start',
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
        {shouldUseSplitMode && splitSegments.length > 0 && (
          <div className="space-y-3 rounded-lg border border-input p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">Segment previews</p>
              {allSegmentsGenerated && (
                <Button
                  className="h-8 text-xs"
                  disabled={isDownloadingAllSegments || isJoiningSegments}
                  onClick={handleDownloadAllSegments}
                  size="sm"
                  variant="outline"
                >
                  {isDownloadingAllSegments || isJoiningSegments ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Joining WAV...
                    </>
                  ) : (
                    'Download All (WAV)'
                  )}
                </Button>
              )}
            </div>
            {splitSegments.map((segment, index) => (
              <div
                className="space-y-2 rounded-md border border-input px-3 py-2"
                key={segment.id}
              >
                {(() => {
                  let segmentStatusIcon: ReactNode = null;
                  if (segment.status === 'success') {
                    segmentStatusIcon = (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    );
                  } else if (segment.status === 'generating') {
                    segmentStatusIcon = (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    );
                  }

                  return (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {segmentStatusIcon}
                          <p className="font-medium text-sm">
                            Segment {index + 1}
                          </p>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {getSplitSegmentStatusLabel(segment.status)}
                        </p>
                        {segment.status === 'failed' && (
                          <Button
                            className="h-6 px-2 text-xs"
                            disabled={isGenerating}
                            onClick={() => handleRetrySegment(index)}
                            size="sm"
                            variant="outline"
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                      <Textarea
                        className="min-h-16 text-xs"
                        disabled={isGenerating}
                        maxLength={SPLIT_SEGMENT_MAX_LENGTH}
                        onChange={(event) =>
                          setSplitSegments((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? (() => {
                                    const nextText = event.target.value;
                                    const cachedUrl =
                                      splitGeneratedByText[nextText];
                                    if (cachedUrl) {
                                      return {
                                        ...item,
                                        text: nextText,
                                        status: 'success' as const,
                                        audioUrl: cachedUrl,
                                      };
                                    }

                                    return {
                                      ...item,
                                      text: nextText,
                                      status: 'idle',
                                      audioUrl: '',
                                    };
                                  })()
                                : item,
                            ),
                          )
                        }
                        value={segment.text}
                      />
                    </>
                  );
                })()}
                {segment.audioUrl && (
                  <div className="flex items-center gap-2">
                    <AudioPlayerWithContext
                      className="rounded-md"
                      playAudioTitle={dict.playAudio}
                      progressColor="#8b5cf6"
                      showWaveform
                      url={segment.audioUrl}
                      waveColor="#888888"
                      waveformClassName="w-40"
                    />
                    <Button
                      onClick={() => downloadSegmentAudio(segment.audioUrl)}
                      size="icon"
                      title={dict.downloadAudio}
                      variant="secondary"
                    >
                      <Download className="size-5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {isJoinerLoading && (
              <p className="text-muted-foreground text-xs">
                Preparing audio joiner...
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
