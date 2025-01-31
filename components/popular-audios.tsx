'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, Pause, ThumbsUp } from 'lucide-react';

interface AudioFile {
  id: string;
  url: string;
  voice_id: string;
  voices: {
    id: string;
    name: string;
  };
  user_id: string;
  storage_key: string;
  duration: number;
  text_content: string;
  total_votes: number;
  total_plays: number;
  is_public: boolean;
  created_at: string;
}

interface PopularAudiosProps {
  dict: {
    loading: string;
    error?: string;
  };
}

export function PopularAudios({ dict }: PopularAudiosProps) {
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: it's grand
  useEffect(() => {
    async function loadAudioFiles() {
      try {
        const response = await fetch('/api/popular-audios');
        if (!response.ok) {
          throw new Error('Failed to fetch audio files');
        }
        const data = await response.json();
        setAudioFiles(data);
      } catch (error) {
      } finally {
        setIsLoading(false);
      }
    }

    loadAudioFiles();
  }, [dict.error]);

  const handlePlayPause = (audio: AudioFile) => {
    if (currentlyPlaying === audio.id) {
      // Pause current audio
      audioElement?.pause();
      setCurrentlyPlaying(null);
      setAudioElement(null);
    } else {
      // Stop previous audio if any
      audioElement?.pause();

      // Play new audio
      const newAudio = new Audio(audio.url);
      newAudio.play();
      setCurrentlyPlaying(audio.id);
      setAudioElement(newAudio);

      // Handle audio ending
      newAudio.onended = () => {
        setCurrentlyPlaying(null);
        setAudioElement(null);
      };
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400">{dict.loading}</p>
      </div>
    );
  }

  if (audioFiles.length === 0) {
    return (
      <div className="text-center py-8 bg-white/5 rounded-lg">
        <p className="text-gray-400">No audio files found</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {audioFiles.map((audio) => (
        <Card key={audio.id} className="bg-white/10 border-white/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-white line-clamp-1">{audio.text_content}</p>
                <p className="text-sm text-gray-400">{audio.voices.name}</p>
              </div>
              <div className="flex items-center space-x-4">
                {/* <div className="flex items-center space-x-1 text-gray-400">
                  <ThumbsUp className="size-4" />
                  <span className="text-sm">{audio.total_votes}</span>
                </div> */}
                <Button
                  variant="outline"
                  size="icon"
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                  onClick={() => handlePlayPause(audio)}
                >
                  {currentlyPlaying === audio.id ? (
                    <Pause className="size-4" />
                  ) : (
                    <Play className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
