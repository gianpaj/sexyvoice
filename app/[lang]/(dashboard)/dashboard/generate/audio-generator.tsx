'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
// import { Slider } from '@/components/ui/slider';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Play, Pause, RotateCcw, Download } from 'lucide-react';
import { toast } from 'sonner';

interface AudioGeneratorProps {
  credits: number;
  selectedVoice: string;
}

export function AudioGenerator({
  credits,
  selectedVoice,
}: AudioGeneratorProps) {
  const [text, setText] = useState('');
  // const [speed, setSpeed] = useState([1]);
  // const [pitch, setPitch] = useState([1]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [creditsUsed, setCreditsUsed] = useState(credits);

  const handleGenerate = async () => {
    if (!text.trim()) {
      toast.error('Please enter text to generate');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(
        `/api/generate-voice?text=${encodeURIComponent(text)}&voice=${selectedVoice}`,
      );

      if (!response.ok) {
        throw new Error('Failed to generate audio');
      }

      const { url, creditsRemaining, creditsUsed } = await response.json();
      setCreditsUsed(creditsUsed);

      const newAudio = new Audio(url);
      // newAudio.playbackRate = speed[0];

      newAudio.addEventListener('ended', () => {
        setIsPlaying(false);
      });

      setAudio(newAudio);

      // Automatically play the audio
      newAudio.play();
      setIsPlaying(true);

      toast.success('Audio generated successfully');
      // TODO fetch credits remaining
    } catch (error) {
      toast.error('Failed to generate audio');
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

  const resetForm = () => {
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      URL.revokeObjectURL(audio.src);
      setAudio(null);
    }
    setText('');
    // setSpeed([1]);
    // setPitch([1]);
    setIsPlaying(false);
  };

  const downloadAudio = () => {
    if (!audio) return;

    const link = document.createElement('a');
    link.href = audio.src;
    link.download = 'generated_audio.mp3';
    link.target = '_blank';
    link.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate Audio</CardTitle>
        <CardDescription>Available credits: {credits}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Text to generate</Label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter the text you want to convert to speech..."
            className="h-32"
          />
        </div>

        <div className="flex items-center justify-start gap-2">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !text.trim() || !selectedVoice}
            className={` ${isGenerating ? 'text-white' : ''}`}
            size="lg"
          >
            {isGenerating ? (
              <span className="flex items-center">
                Generating
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
              'Generate Audio'
            )}
          </Button>

          <div className="space-x-2">
            {audio && (
              <>
                <Button variant="outline" size="icon" onClick={togglePlayback}>
                  {isPlaying ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                </Button>
                <Button variant="outline" size="icon" onClick={resetForm}>
                  <RotateCcw className="size-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={downloadAudio}>
                  <Download className="size-4" />
                </Button>
                <p>Credits Used: {creditsUsed}</p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
