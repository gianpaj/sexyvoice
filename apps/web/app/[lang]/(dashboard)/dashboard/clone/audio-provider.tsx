import { createContext, useContext, useEffect, useRef, useState } from 'react';

import { attemptPlayback } from '@/lib/media-playback';

interface AudioContextType {
  isPlaying: boolean;
  pause: () => void;
  play: () => void;
  reset: () => void;
  setUrlAndPlay: (url: string) => void;
  url: string | null;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context && typeof window !== 'undefined') {
    throw new Error('useAudio must be used within an AudioContext');
  }
  return context;
};

interface AudioProviderProps {
  children: React.ReactNode;
}

export const AudioProvider = ({ children }: AudioProviderProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const setUrlAndPlay = async (url: string) => {
    // Properly cleanup previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    const newAudio = new Audio(url);
    audioRef.current = newAudio;
    setUrl(url);

    // Update state when audio ends
    newAudio.addEventListener('ended', () => {
      setIsPlaying(false);
    });

    // Handle play promise to catch AbortError
    setIsPlaying(true);
    await attemptPlayback(
      () => newAudio.play(),
      () => {
        setIsPlaying(false);
      },
    );
  };

  const pause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const play = async () => {
    if (url) {
      const audio = audioRef.current;
      if (!audio) return;

      setIsPlaying(true);
      await attemptPlayback(
        () => audio.play(),
        () => {
          setIsPlaying(false);
        },
      );
    }
  };

  const reset = () => {
    pause();
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };

  useEffect(() => {
    // Cleanup audio when provider unmounts (e.g., page navigation)
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <AudioContext.Provider
      value={{ setUrlAndPlay, pause, play, reset, url, isPlaying }}
    >
      {children}
    </AudioContext.Provider>
  );
};
