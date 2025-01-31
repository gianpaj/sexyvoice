'use client';

import { useState, useRef, useEffect } from 'react';
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
import { Play, Pause, Download } from 'lucide-react';
import { toast } from 'sonner';
import WaveSurfer from 'wavesurfer.js';

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
  download: string;
}

export function VoiceGenerator({ dict, download }: VoiceGeneratorProps) {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(publicVoices[0].voice);
  const [speed, setSpeed] = useState([1.0]);
  const [accent, setAccent] = useState('en-newest');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);

  useEffect(() => {
    const loadWaveform = async () => {
      if (!waveformRef.current || !audio) {
        return;
      }
      wavesurfer.current = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: 'rgb(255, 255, 255, 0.8)',
        progressColor: 'rgb(175, 193, 230)',
        height: 48,
        cursorWidth: 0,
        barWidth: 2,
        barGap: 1,
        url: audio.src,
        interact: false,
        normalize: true,
      });
      wavesurfer.current.on('play', () => {
        setIsPlaying(true);
      });
      wavesurfer.current.on('finish', () => {
        setIsPlaying(false);
      });

      return () => {
        wavesurfer.current?.destroy();
      };
    };
    loadWaveform();
  }, [audio]);

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

      toast.success('Audio generated successfully');

      setTimeout(() => {
        // Automatically play the audio
        wavesurfer.current?.play();
        setIsPlaying(true);
      }, 100);
    } catch (error) {
      console.error('Error generating audio:', error);

      if (error instanceof Error) {
        toast.error(error.message || 'Failed to generate audio');
      } else {
        toast.error('Failed to generate audio');
      }
    } finally {
      setIsGenerating(false);
      wavesurfer.current?.destroy();
    }
  };

  const togglePlayback = () => {
    if (!audio || !wavesurfer.current) return;

    if (wavesurfer.current.isPlaying()) {
      wavesurfer.current.pause();
    } else {
      wavesurfer.current.play();
    }
  };

  const handleDownload = () => {
    if (!audio?.src) return;

    const link = document.createElement('a');
    link.href = audio.src;
    link.download = 'generated-audio.wav';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
            onValueChange={setSpeed}
            min={0.5}
            max={2}
            step={0.1}
            className="py-2"
          />
          <div className="flex justify-between text-sm text-gray-300">
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
            <span
              className="cursor-pointer hover:text-white"
              onClick={() => setSpeed([0.5])}
            >
              0.5x
            </span>
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
            <span
              className="ml-[-33.3%] cursor-pointer hover:text-white"
              onClick={() => setSpeed([1.0])}
            >
              1x
            </span>
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: <explanation> */}
            <span
              className="cursor-pointer hover:text-white"
              onClick={() => setSpeed([2.0])}
            >
              2x
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <div className="space-x-2">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !text.trim() || !selectedVoice}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isGenerating ? dict.generating : dict.generate}
          </Button>
        </div>
      </div>

      {audio && (
        <div className="mt-4 p-4 bg-white/5 rounded-lg">
          <div className="flex items-center gap-4">
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
              onClick={handleDownload}
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              title={download}
            >
              <Download className="size-4" />
            </Button>

            <div className="flex-1">
              <div ref={waveformRef} className="w-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to format time
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
