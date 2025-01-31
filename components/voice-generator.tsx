'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectGroup,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const voices = [
  { name: 'en-US-JennyNeural', voice: 'Jenny' },
  { name: 'en-US-SaraNeural', voice: 'Sara' },
  { name: 'en-US-GuyNeural', voice: 'Guy' },
  { name: 'en-US-KimberlyNeural', voice: 'Kimberly' },
];

interface VoiceGeneratorProps {
  dict: {
    selectVoice: string;
    enterText: string;
    speed: string;
    pitch: string;
    generate: string;
    generating: string;
    play: string;
    pause: string;
    reset: string;
  };
  lang: string;
}

export function VoiceGenerator({ dict, lang }: VoiceGeneratorProps) {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('');
  const [speed, setSpeed] = useState([1]);
  const [pitch, setPitch] = useState([1]);
  const [accent, setAccent] = useState('en-newest');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  const handleGenerate = async () => {
    if (!selectedVoice || !text.trim()) {
      toast.error('Please select a voice and enter text');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(
        `/api/generate-voice?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(selectedVoice)}&accent=${accent}`,
      );

      if (!response.ok) {
        throw new Error('Failed to generate audio');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create new audio element
      const newAudio = new Audio(audioUrl);
      newAudio.playbackRate = speed[0];
      setAudio(newAudio);

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
    setSelectedVoice('');
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
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-white">{dict.selectVoice}</Label>
        <Select value={selectedVoice} onValueChange={setSelectedVoice}>
          <SelectTrigger className="bg-white/10 border-white/20 text-white">
            <SelectValue placeholder={dict.selectVoice} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Voices</SelectLabel>
              {voices.map((voice) => (
                <SelectItem key={voice.name} value={voice.name}>
                  {voice.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-white">{dict.enterText}</Label>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={dict.enterText}
          className="h-32 bg-white/10 border-white/20 text-white placeholder:text-gray-400"
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-white">{dict.speed}</Label>
          <Slider
            value={speed}
            onValueChange={handleSpeedChange}
            min={0.5}
            max={2}
            step={0.1}
            className="py-2"
          />
          <div className="flex justify-between text-sm text-gray-300">
            <span>0.5x</span>
            <span>{speed[0]}x</span>
            <span>2x</span>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-white">{dict.pitch}</Label>
          <Slider
            value={pitch}
            onValueChange={setPitch}
            min={0.5}
            max={2}
            step={0.1}
            className="py-2"
          />
          <div className="flex justify-between text-sm text-gray-300">
            <span>0.5x</span>
            <span>{pitch[0]}x</span>
            <span>2x</span>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="space-x-2">
          {audio && (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={togglePlayback}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                title={isPlaying ? dict.pause : dict.play}
              >
                {isPlaying ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={resetForm}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                title={dict.reset}
              >
                <RotateCcw className="size-4" />
              </Button>
            </>
          )}
        </div>
        <Button
          onClick={handleGenerate}
          disabled={isGenerating || !text.trim() || !selectedVoice}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isGenerating ? dict.generating : dict.generate}
        </Button>
      </div>
    </div>
  );
}
