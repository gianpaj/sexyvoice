'use client';

import { useCompletion } from '@ai-sdk/react';
import {
  CircleStop,
  Download,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  // CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { GEMINI_VOICES } from '@/lib/constants';
import { APIError } from '@/lib/error-ts';
import PulsatingDots from './PulsatingDots';
import { Alert, AlertDescription } from './ui/alert';

interface AudioGeneratorProps {
  selectedVoice?: Voice;
  hasEnoughCredits: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  dict: any;
}

export function AudioGenerator({
  selectedVoice,
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

  const showEnhanceText = !GEMINI_VOICES.includes(selectedVoice?.name || '');

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

      const response = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, voice: selectedVoice?.name }),
        signal: abortController.current.signal,
      });

      if (!response.ok) {
        const error: APIError = await response.json();

        throw new APIError(error.serverMessage, response);
      }

      const { url, creditsRemaining, creditsUsed } = await response.json();

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
      if (error instanceof APIError) {
        toast.error(error.message || dict.error);
      } else {
        toast.error(dict.error);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Keyboard shortcut handler
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
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
  }, [isGenerating, text, selectedVoice, hasEnoughCredits]); // Dependencies for the effect

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

      if (audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(audio.src);
      }
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Audio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="relative">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={dict.textAreaPlaceholder}
              className="h-32 pr-12"
            />
            {showEnhanceText && (
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 h-8 w-8"
                onClick={handleEnhanceText}
                disabled={!text.trim() || isEnhancingText || isGenerating}
                title="Enhance text with AI emotion tags"
              >
                <Sparkles
                  className={`h-4 w-4 text-yellow-300 ${isEnhancingText ? 'animate-spin' : ''}`}
                />
              </Button>
            )}
          </div>
        </div>

        <div
          className={`flex ${hasEnoughCredits ? 'items-center' : 'flex-col items-start'} justify-start gap-2`}
        >
          {!hasEnoughCredits && (
            <Alert variant="destructive" className="w-fit">
              <AlertDescription>{dict.notEnoughCredits}</AlertDescription>
            </Alert>
          )}
          <Button
            onClick={handleGenerate}
            data-testid="generate-button"
            disabled={
              isGenerating ||
              !text.trim() ||
              !selectedVoice ||
              !hasEnoughCredits
            }
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
                <span className="text-xs text-gray-300 opacity-70 border-[1px] rounded-sm border-gray-400 p-1">
                  {shortcutKey}
                </span>
              </span>
            )}
          </Button>

          <div className="space-x-2">
            {isGenerating && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => abortController.current?.abort()}
              >
                <CircleStop name="cancel" className="size-4" />
              </Button>
            )}
            {audio && (
              <>
                <Button variant="outline" size="icon" onClick={togglePlayback}>
                  {isPlaying ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title={dict.resetPlayer}
                  onClick={resetPlayer}
                >
                  <RotateCcw className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  title={dict.downloadAudio}
                  onClick={downloadAudio}
                >
                  <Download className="size-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
