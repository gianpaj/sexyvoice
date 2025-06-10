'use client';

import { Download, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import WaveSurfer from 'wavesurfer.js';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { downloadFile } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

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
    if (!selectedVoice || !text.trim()) {
      toast.error('Please select a voice and enter text');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, voice: selectedVoice }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate audio');
      }

      const { url } = await response.json();

      const newAudio = new Audio(url);

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
    downloadFile(audio.src, 'generated-audio.wav');
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

      <div className="flex justify-center">
        <div className="space-x-2">
          <Button
            onClick={handleGenerate}
            disabled={true}
            // disabled={isGenerating || !text.trim() || !selectedVoice}
            className="bg-blue-600 hover:bg-blue-700"
            title="Coming soon"
          >
            {dict.generate}
            {/* {isGenerating ? dict.generating : dict.generate} */}
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
