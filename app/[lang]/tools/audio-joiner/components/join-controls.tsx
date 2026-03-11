'use client';

import { Pause, Play } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { JoinerOutputFormat } from '../hooks/use-ffmpeg-joiner';

interface JoinControlsProps {
  canJoin: boolean;
  isPlaying: boolean;
  isProcessing: boolean;
  labels: {
    format: string;
    play: string;
    pause: string;
    join: string;
    joining: string;
    cancel: string;
  };
  onCancel: () => void;
  onJoin: () => void;
  onOutputFormatChange: (format: JoinerOutputFormat) => void;
  onTogglePlayPause: () => void;
  outputFormat: JoinerOutputFormat;
}

export function JoinControls({
  outputFormat,
  onOutputFormatChange,
  isPlaying,
  onTogglePlayPause,
  onJoin,
  onCancel,
  isProcessing,
  canJoin,
  labels,
}: JoinControlsProps) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 border-border/60 border-t pt-6 md:flex-row md:items-center">
      <Button
        className="h-12 min-w-24 rounded-full"
        onClick={onTogglePlayPause}
        type="button"
        variant="secondary"
      >
        {isPlaying ? (
          <Pause className="mr-1 h-4 w-4" />
        ) : (
          <Play className="mr-1 h-4 w-4" />
        )}
        {isPlaying ? labels.pause : labels.play}
      </Button>

      <div className="flex w-full items-center justify-end gap-3 md:w-auto">
        <div className="w-full md:w-48">
          <Label className="mb-1 block text-muted-foreground text-sm">
            {labels.format}
          </Label>
          <Select
            disabled={isProcessing}
            onValueChange={(value) =>
              onOutputFormatChange(value as JoinerOutputFormat)
            }
            value={outputFormat}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mp3">MP3</SelectItem>
              <SelectItem value="wav">WAV</SelectItem>
              <SelectItem value="m4a">M4A</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isProcessing ? (
          <Button
            className="h-12 min-w-24 rounded-full"
            onClick={onCancel}
            type="button"
            variant="destructive"
          >
            {labels.cancel}
          </Button>
        ) : (
          <Button
            className="h-12 min-w-24 rounded-full"
            disabled={!canJoin}
            onClick={onJoin}
            type="button"
          >
            {isProcessing ? labels.joining : labels.join}
          </Button>
        )}
      </div>
    </div>
  );
}
