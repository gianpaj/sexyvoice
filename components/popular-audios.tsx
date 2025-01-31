'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, ThumbsUp } from 'lucide-react';

interface AudioFile {
  id: string;
  text_content: string;
  voices: {
    name: string;
  };
  total_votes: number;
  total_plays: number;
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
                <div className="flex items-center space-x-1 text-gray-400">
                  <ThumbsUp className="size-4" />
                  <span className="text-sm">{audio.total_votes}</span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                >
                  <Play className="size-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
