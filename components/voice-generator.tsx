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

const publicVoices = [
  {
    id: '0',
    language: 'en-US',
    is_public: true,
    name: 'example reference',
    voice: 'example_reference',
    accent: 'en-newest',
  },
  // {
  //   id: '1',
  //   language: 'en-US',
  //   is_public: true,

  //   name: 'en-US-SaraNeural',
  //   voice: 'Sara',
  // },
  // {
  //   id: '2',
  //   language: 'en-US',
  //   is_public: true,
  //   name: 'en-US-GuyNeural',
  //   voice: 'Guy',
  // },
  // {
  //   id: '3',
  //   language: 'en-US',
  //   is_public: true,
  //   name: 'en-US-KimberlyNeural',
  //   voice: 'Kimberly',
  // },
];

interface VoiceGeneratorProps {
  dict: {
    selectVoice: string;
    enterText: string;
    speed: string;
    generate: string;
    generating: string;
    play: string;
    pause: string;
    reset: string;
  };
}

export function VoiceGenerator({ dict }: VoiceGeneratorProps) {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(publicVoices[0].voice);
  const [speed, setSpeed] = useState([1.0]);
  const [accent, setAccent] = useState('en-newest');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  const handleGenerate = async () => {
    if (!selectedVoice || !text.trim() || !accent) {
      toast.error('Please select a voice, accent and enter text');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch(
        `/api/generate-voice?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(selectedVoice)}&accent=${accent}&speed=${speed}`,
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate audio');
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
      console.error('Error generating audio:', error);

      if (error instanceof Error) {
        toast.error(error.message || 'Failed to generate audio');
      } else {
        toast.error('Failed to generate audio');
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
              {publicVoices.map((voice) => (
                <SelectItem key={voice.name} value={voice.voice}>
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
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          placeholder={dict.enterText}
          className="h-32 bg-white/10 border-white/20 text-white placeholder:text-gray-400"
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label className="text-white">{dict.speed}</Label>

            <span className="text-sm text-white">{speed[0].toFixed(1)}x</span>
          </div>
          <Slider
            value={speed}
            onValueChange={handleSpeedChange}
            min={0.5}
            max={2}
            step={0.1}
            className="py-2"
          />
          <div className="flex justify-between text-sm text-gray-300">
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
            <span
              className="cursor-pointer hover:text-white"
              onClick={() => handleSpeedChange([0.5])}
            >
              0.5x
            </span>
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
            <span
              className="ml-[-33.3%] cursor-pointer hover:text-white"
              onClick={() => handleSpeedChange([1.0])}
            >
              1x
            </span>
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
            <span
              className="cursor-pointer hover:text-white"
              onClick={() => handleSpeedChange([2.0])}
            >
              2x
            </span>
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
              {/* <Button
                variant="outline"
                size="icon"
                onClick={resetForm}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                title={dict.reset}
              >
                <RotateCcw className="size-4" />
              </Button> */}
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
