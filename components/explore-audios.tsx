'use client';

import { useEffect, useState } from 'react';
import { Pause, Play, ThumbsUp, ThumbsDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AudioFile {
  id: string;
  url: string;
  text_content: string;
  created_at: string;
  voices: { id: string; name: string };
  ups: number;
  downs: number;
  score: number;
}

const filters = [
  { value: 'day', label: 'Top Day' },
  { value: 'week', label: 'Top Week' },
  { value: 'month', label: 'Top Month' },
  { value: 'all', label: 'All Time' },
  { value: 'trending', label: 'Trending' },
];

export function ExploreAudios({ dict }: { dict: any }) {
  const [filter, setFilter] = useState<string>('day');
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/public-audios?filter=${filter}`);
        if (res.ok) {
          const data = await res.json();
          setAudioFiles(data);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filter]);

  const handlePlay = (audio: AudioFile) => {
    if (playing === audio.id) {
      audioEl?.pause();
      setPlaying(null);
      return;
    }
    audioEl?.pause();
    const el = new Audio(audio.url);
    el.play();
    el.onended = () => setPlaying(null);
    setAudioEl(el);
    setPlaying(audio.id);
  };

  const vote = async (audioId: string, value: 1 | -1) => {
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioId, vote: value }),
    });
    if (res.ok) {
      const data = await res.json();
      setAudioFiles((prev) =>
        prev.map((a) =>
          a.id === audioId
            ? { ...a, ups: data.ups, downs: data.downs, score: data.ups - data.downs }
            : a,
        ),
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="max-w-40">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filters.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {dict.filter[f.value] || f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {loading ? (
        <p className="text-gray-400">{dict.loading}</p>
      ) : audioFiles.length === 0 ? (
        <p className="text-gray-400">{dict.noFiles}</p>
      ) : (
        <div className="grid gap-4">
          {audioFiles.map((audio) => (
            <Card key={audio.id} className="bg-white/10 border-white/20">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-1 overflow-hidden">
                    <p className="text-white line-clamp-1">{audio.voices.name}</p>
                    <p className="text-sm text-gray-400 line-clamp-2">
                      {audio.text_content}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                    onClick={() => handlePlay(audio)}
                  >
                    {playing === audio.id ? (
                      <Pause className="size-4" />
                    ) : (
                      <Play className="size-4" />
                    )}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => vote(audio.id, 1)}
                    title={dict.voteUp}
                  >
                    <ThumbsUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => vote(audio.id, -1)}
                    title={dict.voteDown}
                  >
                    <ThumbsDown className="size-4" />
                  </Button>
                  <span className="text-sm text-gray-300">{audio.score}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
