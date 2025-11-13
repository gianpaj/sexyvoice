import { createContext, useContext, useEffect, useRef, useState } from 'react';

type AudioContextType = {
  setSong: (url: string) => void;
  pauseSong: () => void;
  currentPlayingUrl: string | null;
};

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

type AudioProviderProps = {
  children: React.ReactNode;
};

export const AudioProvider = ({ children }: AudioProviderProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentPlayingUrl, setCurrentPlayingUrl] = useState<string | null>(
    null,
  );

  const setSong = (url: string) => {
    console.log('setSong', url);

    // Properly cleanup previous audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }

    const newAudio = new Audio(url);
    audioRef.current = newAudio;
    setCurrentPlayingUrl(url);

    // Update state when audio ends
    newAudio.addEventListener('ended', () => {
      setCurrentPlayingUrl(null);
    });

    // Handle play promise to catch AbortError
    const playPromise = newAudio.play();
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

  const pauseSong = () => {
    console.log('pauseSong');

    audioRef.current?.pause();
    setCurrentPlayingUrl(null);
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
    <AudioContext.Provider value={{ setSong, pauseSong, currentPlayingUrl }}>
      {children}
    </AudioContext.Provider>
  );
};
