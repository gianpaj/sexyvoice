'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

interface AudioGeneratorProps {
  credits: number;
}

export function AudioGenerator({ credits }: AudioGeneratorProps) {
  const [text, setText] = useState('');
  const [speed, setSpeed] = useState([1]);
  const [pitch, setPitch] = useState([1]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  const handleGenerate = async () => {
    if (!text.trim()) {
      toast.error('Please enter text to generate');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(
        `/api/generate-voice?text=${encodeURIComponent(text)}&voice=example_reference&accent=en-newest`,
      );

      if (!response.ok) {
        throw new Error('Failed to generate audio');
      }

      const { url } = await response.json();

      const newAudio = new Audio(url);
      newAudio.playbackRate = speed[0];

      newAudio.addEventListener('ended', () => {
        setIsPlaying(false);
      });

      setAudio(newAudio);

      // Automatically play the audio
      newAudio.play();
      setIsPlaying(true);

      toast.success('Audio generated successfully');
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
    setSpeed([1]);
    setPitch([1]);
    setIsPlaying(false);
  };

  // Update playback rate when speed changes
  const handleSpeedChange = (newSpeed: number[]) => {
    setSpeed(newSpeed);
    if (audio) {
      audio.playbackRate = newSpeed[0];
    }
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

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Speed</Label>
            <Slider
              value={speed}
              onValueChange={handleSpeedChange}
              min={0.5}
              max={2}
              step={0.1}
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>0.5x</span>
              <span>{speed[0]}x</span>
              <span>2x</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Pitch</Label>
            <Slider
              value={pitch}
              onValueChange={setPitch}
              min={0.5}
              max={2}
              step={0.1}
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>0.5x</span>
              <span>{pitch[0]}x</span>
              <span>2x</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
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
              </>
            )}
          </div>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !text.trim()}
          >
            {isGenerating ? 'Generating...' : 'Generate Audio'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
