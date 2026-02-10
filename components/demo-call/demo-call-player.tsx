'use client';

import { PhoneOff } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import { DemoTranscript } from '@/components/demo-call/demo-transcript';
import { Button } from '@/components/ui/button';
import type { DemoCallData } from '@/data/demo-transcripts';
import { defaultPresets } from '@/data/presets';

interface DemoCallPlayerProps {
  callData: DemoCallData;
  onDisconnect: () => void;
}

function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (num: number): string => num.toString().padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function DemoCallPlayer({ callData, onDisconnect }: DemoCallPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const rafRef = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const onDisconnectRef = useRef(onDisconnect);

  // Keep ref up to date
  useEffect(() => {
    onDisconnectRef.current = onDisconnect;
  }, [onDisconnect]);

  // const frequencyBands = useAudioAnalyser(audioElement, 5, 100, 600);

  const preset = defaultPresets.find((p) => p.id === callData.characterId);

  const handleDisconnect = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    onDisconnectRef.current();
  }, []);

  // Create audio element and start playback
  useEffect(() => {
    const audio = new Audio(callData.audioSrc);
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;

    audio.play().catch(() => {
      // Autoplay blocked — user interaction already happened via Call button
    });

    const handleEnded = () => {
      onDisconnectRef.current();
    };

    audio.addEventListener('ended', handleEnded);

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedSeconds(
        Math.floor((Date.now() - startTimeRef.current) / 1000),
      );
    }, 1000);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.pause();
      audio.src = '';
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callData.audioSrc]);

  // Poll currentTime for transcript sync
  useEffect(() => {
    const poll = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
      rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Character info */}
      <div className="flex items-center gap-3">
        {preset?.image && (
          <div className="relative h-10 w-10 overflow-hidden rounded-full bg-neutral-800">
            <Image
              src={`/characters/${preset.image}`}
              alt={preset.name}
              fill
              className="object-cover"
            />
          </div>
        )}
        <span className="font-medium text-foreground">
          {preset?.name ?? 'Character'}
        </span>
      </div>

      {/* Visualizer */}
      {/*<MultibandAudioVisualizer
        state="speaking"
        barWidth={8}
        minBarHeight={10}
        maxBarHeight={60}
        frequencies={frequencyBands.length > 0 ? frequencyBands : Array.from({ length: 5 }, () => new Float32Array(1))}
        borderRadius={4}
        gap={4}
        barColor="hsl(var(--brand-purple))"
      />*/}

      {/* Transcript */}
      <DemoTranscript
        segments={callData.transcript}
        currentTime={currentTime}
        characterName={preset?.name ?? 'Character'}
      />

      {/* Controls */}
      <div className="flex flex-col items-center gap-2">
        <Button
          className="h-9"
          onClick={handleDisconnect}
          variant="secondary"
        >
          <PhoneOff className="mr-2 h-4 w-4" />
          End call
        </Button>
        <div className="font-mono text-muted-foreground text-sm">
          {formatTime(elapsedSeconds)}
        </div>
      </div>
    </div>
  );
}
