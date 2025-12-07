import { createContext, useContext, useEffect, useRef, useState } from 'react';

interface AudioContextType {
  setUrlAndPlay: (url: string) => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  url: string | null;
  isPlaying: boolean;
}

export const AudioContext = createContext<AudioContextType | undefined>(
  undefined,
);

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (!context && typeof window !== 'undefined') {
    throw new Error('useAudio must be used within a AudioContext');
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

  const setUrlAndPlay = (url: string) => {
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
    const playPromise = newAudio.play();
    setIsPlaying(true);
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          // newAudio.pause();
        })
        .catch((error) => {
          // Handle abort error silently or log if needed
          if (error.name !== 'AbortError') {
            console.error('Audio play error:', error);
          }
        });
    }
  };

  const pause = () => {
    audioRef.current?.pause();
    setIsPlaying(false);
  };

  const play = () => {
    if (url) {
      audioRef.current?.play();
      setIsPlaying(true);
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
