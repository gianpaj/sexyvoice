"use client";

import { useCompletion } from "@ai-sdk/react";
import { CircleStop, Download, Loader2, RotateCcw } from "lucide-react";
import dynamic from "next/dynamic";
import {
  type ComponentPropsWithoutRef,
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAudio } from "@/app/[lang]/(dashboard)/dashboard/clone/audio-provider";
import { toast } from "@/components/services/toast";
import { SpotlightField } from "@/components/spotlight-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getCharactersLimit } from "@/lib/ai";
import { downloadUrl } from "@/lib/download";
import { APIError } from "@/lib/error-ts";
import { resizeTextarea } from "@/lib/react-textarea-autosize";
import { MAX_FREE_GENERATIONS } from "@/lib/supabase/constants";
import { cn, getTtsProvider } from "@/lib/utils";
import type messages from "@/messages/en.json";
import {
  type AudioPlayerControls,
  AudioPlayerWithContext,
} from "./audio-player-with-context";
import { GenerateButton } from "./generate-button";

const NonGrokPromptEditor = dynamic(
  () => import("./non-grok-editor").then((mod) => mod.NonGrokPromptEditor),
  { ssr: false },
);

import { GrokTTSEditor } from "./grok-tts-editor";
import { Alert, AlertDescription } from "./ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface AnimatedPromptTextareaProps extends ComponentPropsWithoutRef<
  typeof Textarea
> {
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
          "border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0",
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
AnimatedPromptTextarea.displayName = "AnimatedPromptTextarea";

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
  dict: (typeof messages)["generate"];
  hasEnoughCredits: boolean;
  isPaidUser: boolean;
  selectedStyle?: string;
  selectedVoice?: Tables<"voices">;
}

export function AudioGenerator({
  dict,
  hasEnoughCredits,
  isPaidUser,
  selectedStyle,
  selectedVoice,
}: AudioGeneratorProps) {
  const [text, setText] = useState("");
  const [previousText, setPreviousText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioURL, setAudioURL] = useState("");
  const [isEnhancingText, setIsEnhancingText] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimatedCredits, setEstimatedCredits] = useState<number | null>(null);
  const [playerControls, setPlayerControls] =
    useState<AudioPlayerControls | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedGrokLanguage, setSelectedGrokLanguage] = useState("auto");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const abortController = useRef<AbortController | null>(null);

  const audio = useAudio();

  const provider = useMemo(
    () => getTtsProvider(selectedVoice?.model),
    [selectedVoice?.model],
  );
  const isGeminiVoice = provider === "gemini";
  const isGrokVoice = provider === "grok";
  const showEnhanceButton = provider === "replicate";


  const charactersLimit = useMemo(
    () => getCharactersLimit(selectedVoice?.model || "", isPaidUser),
    [selectedVoice, isPaidUser],
  );

  const textareaRightPadding = useMemo(() => {
    if (isGeminiVoice) {
      return "pr-10";
    }

    if (showEnhanceButton) {
      return "pr-20";
    }

    return "pr-16";
  }, [isGeminiVoice, showEnhanceButton]);

  const textIsOverLimit = text.length > charactersLimit;

  const requestBody = useMemo(
    () => ({
      text,
      voice: selectedVoice?.name,
      styleVariant: isGeminiVoice ? selectedStyle : "",
      language: isGrokVoice ? selectedGrokLanguage : undefined,
    }),
    [
      isGeminiVoice,
      isGrokVoice,
      selectedStyle,
      selectedVoice?.name,
      selectedGrokLanguage,
      text,
    ],
  );

  const handleCancel = useCallback(() => {
    setIsGenerating(false);
    abortController.current?.abort();
  }, []);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      abortController.current = new AbortController();

      const response = await fetch("/api/generate-voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: abortController.current.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.errorCode && dict[data.errorCode as keyof typeof dict]) {
          const errorMessage = dict[
            data.errorCode as keyof typeof dict
          ] as string;
          throw new APIError(
            errorMessage.replace("__COUNT__", MAX_FREE_GENERATIONS.toString()),
            response,
          );
        }

        throw new APIError(data.error || data.serverMessage, response);
      }

      setAudioURL(data.url);
      toast.success(dict.success);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
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
  }, [dict, requestBody]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();

        if (!isGenerating && text.trim() && selectedVoice && hasEnoughCredits) {
          handleGenerate().catch((error) => {
            console.error("Keyboard shortcut generation failed:", error);
          });
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleGenerate, hasEnoughCredits, isGenerating, selectedVoice, text]);

  const resetPlayer = () => {
    if (playerControls) {
      playerControls.reset();
      return;
    }

    if (audio) {
      audio.reset();
    }
  };

  const downloadAudio = async () => {
    if (!audioURL) return;

    const anchorElement = document.createElement("a");
    document.body.appendChild(anchorElement);
    anchorElement.style.display = "none";

    try {
      await downloadUrl(audioURL, anchorElement);
    } catch {
      toast.error(dict.error);
    }
  };

  const { complete } = useCompletion({
    api: "/api/generate-text",
    streamProtocol: "text",
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
        toast("Text enhanced with emotion tags!", {
          action: {
            label: "Undo",
            onClick: () => setText(previousText),
          },
        });
      }
    } catch (error) {
      console.error("Error enhancing text:", error);
      toast.error("Failed to enhance text");
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

  const handleEstimateCredits = async () => {
    if (!(selectedVoice && (isGeminiVoice || isGrokVoice) && text.trim()))
      return;

    setIsEstimating(true);
    try {
      const response = await fetch("/api/estimate-credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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

      const nextEstimatedCredits = Number(data.estimatedCredits);
      if (Number.isFinite(nextEstimatedCredits)) {
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
              dict={dict.grok}
              isPaidUser={isPaidUser}
              maxLength={charactersLimit}
              onChange={setText}
              placeholder={dict.textAreaPlaceholder}
              selectedGrokLanguage={selectedGrokLanguage}
              setSelectedGrokLanguage={setSelectedGrokLanguage}
              value={text}
            />
          ) : (
            <NonGrokPromptEditor
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
              textareaRef={textareaRef}
              textareaRightPadding={textareaRightPadding}
              textIsOverLimit={textIsOverLimit}
            />
          )}

          {(isGeminiVoice || isGrokVoice) && (
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
            "grid grid-cols-1 justify-start gap-3 sm:grid-cols-[1fr_2fr]",
            hasEnoughCredits ? "" : "flex flex-col items-start",
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
              ctaText={dict.ctaButton}
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
            {audioURL && (
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
      </CardContent>
    </Card>
  );
}
