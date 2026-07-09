'use client';

import { Pause, Play } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { demoCallData } from '@/data/demo-transcripts';
import { useAudioAnalyser } from '@/hooks/use-audio-analyser';
import { DemoCharacterAvatar } from './demo-character-avatar';
import { DemoWaveform } from './demo-waveform';

const demoCharacters = [
  {
    id: 'ramona',
    name: 'Ramona',
    image: 'ramona.webp',
    accent: 'from-red-500 to-pink-500',
    glowColor: '239, 68, 68',
  },
  {
    id: 'miyu',
    name: 'Miyu',
    image: 'miyu.webp',
    accent: 'from-blue-400 to-cyan-400',
    glowColor: '96, 165, 250',
  },
  {
    id: 'luna',
    name: 'Luna',
    image: 'luna.webp',
    accent: 'from-amber-400 to-orange-500',
    glowColor: '251, 191, 36',
  },
  {
    id: 'rafal',
    name: 'Rafal',
    image: 'rafal.webp',
    accent: 'from-violet-500 to-fuchsia-500',
    glowColor: '139, 92, 246',
  },
] as const;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

interface DemoCallPlayerProps {
  pickCharacterLabel: string;
  playLabel: string;
  stopLabel: string;
}

export function DemoCallPlayer({
  playLabel,
  stopLabel,
  pickCharacterLabel,
}: DemoCallPlayerProps) {
  const [selectedCharId, setSelectedCharId] = useState<string>('ramona');
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Ref to hold the audio element for cleanup without re-triggering effects
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const frequencyBands = useAudioAnalyser(audioElement);

  const selectedChar = demoCharacters.find((c) => c.id === selectedCharId)!;
  const charData = demoCallData[selectedCharId];
  const duration = charData.durationSeconds;

  // Compute average energy from frequency bands for speaking detection
  const avgEnergy =
    frequencyBands.length > 0
      ? frequencyBands.reduce((sum, val) => sum + val, 0) /
        frequencyBands.length
      : 0;

  const hasAudioEnergy = avgEnergy > 0.15;

  // Stop and tear down current audio
  const stopAudio = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (cleanupListenersRef.current) {
      cleanupListenersRef.current();
      cleanupListenersRef.current = null;
    }

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    audioRef.current = null;
    setAudioElement(null);
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Start playback for a given character
  const playCharacter = (charId: string) => {
    // Clean up any existing audio first
    stopAudio();

    const data = demoCallData[charId];
    if (!data) return;

    // Create a fresh Audio element (required for createMediaElementSource)
    const audio = new Audio(data.audioSrc);
    audio.preload = 'auto';
    audioRef.current = audio;

    // Track time updates for the timer display
    const onTimeUpdate = () => {
      if (audioRef.current === audio) {
        setCurrentTime(audio.currentTime);
      }
    };

    const cleanupCurrentAudio = () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      if (audioRef.current === audio) {
        cleanupListenersRef.current = null;
        audioRef.current = null;
        setAudioElement(null);
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };

    const onEnded = () => {
      cleanupCurrentAudio();
    };

    const onError = () => {
      cleanupCurrentAudio();
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    cleanupListenersRef.current = () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };

    // Set the audio element state first so useAudioAnalyser can set up
    // the Web Audio graph before play() is called
    setAudioElement(audio);
    setIsPlaying(true);

    // Small delay to let the AudioContext connect before playing
    requestAnimationFrame(() => {
      audio.play().catch(() => {
        cleanupCurrentAudio();
      });
    });
  };

  // Handle play/stop toggle
  const handlePlayStop = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      playCharacter(selectedCharId);
    }
  };

  // Handle character selection
  const handleCharacterSelect = (charId: string) => {
    if (charId === selectedCharId && !isPlaying) {
      // Same character, not playing — just play
      playCharacter(charId);
      return;
    }

    setSelectedCharId(charId);

    if (isPlaying) {
      // Auto-play the new character
      // Need to use setTimeout to allow state to settle
      stopAudio();
      // Play after a tick so cleanup completes
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        playCharacter(charId);
      }, 50);
    }
  };

  // Cleanup on unmount
  useEffect(
    () => () => {
      stopAudio();
    },
    [],
  );

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6">
      {/* Character picker */}
      <fieldset className="flex items-center justify-center gap-4 border-none p-0">
        <legend className="sr-only">{pickCharacterLabel}</legend>
        {demoCharacters.map((char) => {
          const isSelected = char.id === selectedCharId;
          return (
            <label
              className="group flex cursor-pointer flex-col items-center gap-1.5"
              key={char.id}
            >
              <input
                checked={isSelected}
                className="peer sr-only"
                name="demo-character"
                onChange={() => handleCharacterSelect(char.id)}
                type="radio"
                value={char.id}
              />
              {/* Avatar with ring */}
              <div
                className={`relative rounded-full p-[2px] transition-all duration-300 ${
                  isSelected
                    ? `bg-gradient-to-tr ${char.accent}`
                    : 'bg-transparent'
                } group-hover:scale-105 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background`}
              >
                <div className="rounded-full bg-background p-[2px]">
                  <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-neutral-800 sm:h-12 sm:w-12">
                    <Image
                      alt={char.name}
                      className={`object-cover transition-opacity duration-300 ${
                        isSelected ? '' : 'opacity-60 grayscale'
                      }`}
                      fill
                      sizes="48px"
                      src={`/characters/${char.image}`}
                    />
                  </div>
                </div>
              </div>

              {/* Name */}
              <span
                className={`font-medium text-xs transition-colors ${
                  isSelected
                    ? 'text-foreground'
                    : 'text-muted-foreground group-hover:text-foreground'
                }`}
              >
                {char.name}
              </span>
            </label>
          );
        })}
      </fieldset>

      {/* Large avatar with energy-driven pulse */}
      <DemoCharacterAvatar
        accentGradient={selectedChar.accent}
        energy={avgEnergy}
        glowColor={selectedChar.glowColor}
        image={selectedChar.image}
        isSpeaking={isPlaying && hasAudioEnergy}
        name={selectedChar.name}
      />

      {/* Waveform */}
      <DemoWaveform frequencyBands={frequencyBands} isActive={isPlaying} />

      {/* Timer */}
      <div
        aria-live="off"
        className="font-mono text-muted-foreground text-sm tabular-nums"
      >
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>

      {/* Play / Stop button */}
      <Button
        aria-label={isPlaying ? stopLabel : playLabel}
        className="min-w-[140px] gap-2"
        onClick={handlePlayStop}
        size="lg"
        variant={isPlaying ? 'outline' : 'default'}
      >
        {isPlaying ? (
          <>
            <Pause className="size-4" />
            {stopLabel}
          </>
        ) : (
          <>
            <Play className="size-4" />
            {playLabel}
          </>
        )}
      </Button>
    </div>
  );
}
