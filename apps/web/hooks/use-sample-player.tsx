'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

interface SamplePlayer {
  /** Key of the sample that is playing, or null. */
  playingKey: string | null;
  stop: () => void;
  /** Plays `url` under `key`, or stops it if `key` is already playing. */
  toggle: (key: string, url: string | null | undefined) => void;
}

const SamplePlayerContext = createContext<SamplePlayer | undefined>(undefined);

/**
 * One audio element for every voice sample under it, so starting a sample
 * stops the one before it.
 */
export function SamplePlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  const stop = () => {
    audioRef.current?.pause();
    setPlayingKey(null);
  };

  const toggle = (key: string, url: string | null | undefined) => {
    if (playingKey === key) {
      stop();
      return;
    }
    if (!url) return;

    audioRef.current ??= new Audio();
    const audio = audioRef.current;
    audio.pause();
    audio.src = url;
    const clear = () =>
      setPlayingKey((current) => (current === key ? null : current));
    audio.onended = clear;
    audio.onerror = clear;
    setPlayingKey(key);
    audio.play().catch(clear);
  };

  useEffect(() => () => audioRef.current?.pause(), []);

  return (
    <SamplePlayerContext.Provider value={{ playingKey, stop, toggle }}>
      {children}
    </SamplePlayerContext.Provider>
  );
}

export function useSamplePlayer(): SamplePlayer {
  const context = useContext(SamplePlayerContext);
  if (!context) {
    throw new Error('useSamplePlayer must be used within SamplePlayerProvider');
  }
  return context;
}
