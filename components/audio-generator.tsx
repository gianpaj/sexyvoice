'use client';

import { CircleStop, Download, Pause, Play, RotateCcw } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { downloadFile } from '@/lib/utils';
import {
  Card,
  CardContent,
  // CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { APIError } from '@/lib/error-ts';
import { Alert, AlertDescription } from './ui/alert';

interface AudioGeneratorProps {
  selectedVoice: string;
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  // const [creditsUsed, setCreditsUsed] = useState(credits);

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
        body: JSON.stringify({ text, voice: selectedVoice }),
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
    downloadFile(audio.src);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Audio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={dict.textAreaPlaceholder}
            className="h-32"
          />
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
                <span className="inline-flex ml-1">
                  <span className="animate-[pulse_1.4s_ease-in-out_infinite]">
                    .
                  </span>
                  <span className="animate-[pulse_1.4s_ease-in-out_0.4s_infinite]">
                    .
                  </span>
                  <span className="animate-[pulse_1.4s_ease-in-out_0.8s_infinite]">
                    .
                  </span>
                </span>
              </span>
            ) : (
              <span>{dict.ctaButton}</span>
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
