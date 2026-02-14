'use client';

import { FileAudio, Mic, Square, Upload } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import { cn } from '@/lib/utils';

interface Props {
  onAudioReady: (audio: Float32Array) => void;
  onFileSelected?: (file: File) => void;
  onRemove?: () => void;
  disabled?: boolean;
  dict: (typeof langDict)['transcribe']['audioInput'];
}

/**
 * Resample audio to 16kHz mono Float32Array as required by Whisper.
 */
async function decodeAudioFile(file: File): Promise<Float32Array> {
  const audioContext = new AudioContext({ sampleRate: 16_000 });
  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    // Take first channel (mono)
    const audioData = audioBuffer.getChannelData(0);
    return audioData;
  } finally {
    await audioContext.close();
  }
}

export function AudioInput({
  onAudioReady,
  onFileSelected,
  onRemove,
  disabled = false,
  dict,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const processFile = useCallback(
    async (file: File) => {
      setAudioFile(file);
      onFileSelected?.(file);
      try {
        const audioData = await decodeAudioFile(file);
        onAudioReady(audioData);
      } catch (error) {
        setAudioFile(null);
        console.error('Failed to decode audio file:', error);
      }
    },
    [onAudioReady, onFileSelected],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('audio/') || file?.type.startsWith('video/')) {
        processFile(file);
      }
    },
    [processFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile],
  );

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], 'recording.webm', {
          type: 'audio/webm',
        });
        for (const track of stream.getTracks()) {
          track.stop();
        }
        await processFile(file);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Microphone access denied or not available:', error);
    }
  }, [processFile]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const handleRemove = useCallback(() => {
    setAudioFile(null);
    onRemove?.();
  }, [onRemove]);

  if (audioFile) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <FileAudio className="h-5 w-5 text-primary" />
          <div>
            <p className="font-medium text-foreground text-sm">
              {audioFile.name}
            </p>
            <p className="text-muted-foreground text-xs">
              {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
        </div>
        <Button
          disabled={disabled}
          onClick={handleRemove}
          size="sm"
          variant="ghost"
        >
          {dict.remove}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* biome-ignore lint/a11y/useSemanticElements: we need a div for drag-and-drop */}
      <div
        className={cn(
          'group relative cursor-pointer transition-all duration-300 ease-out',
          'rounded-2xl border-2 border-dashed',
          'p-8 md:p-12',
          disabled && 'cursor-not-allowed opacity-50',
          isDragging
            ? 'scale-[1.02] border-primary bg-primary/10 shadow-glow'
            : 'border-border hover:border-primary/50 hover:bg-muted/50',
        )}
        onClick={(e) => {
          if (disabled) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          document.getElementById('transcribe-file-input')?.click();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) {
            return;
          }
          if (e.dataTransfer.items?.length) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) {
            return;
          }
          setIsDragging(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) {
            return;
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (disabled) {
            return;
          }
          handleDrop(e);
        }}
        onKeyDown={(e) => {
          if (disabled) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            document.getElementById('transcribe-file-input')?.click();
          }
        }}
        role="button"
        tabIndex={0}
      >
        <input
          accept="audio/*,video/*"
          className="hidden"
          id="transcribe-file-input"
          onChange={handleFileInput}
          type="file"
        />
        <div className="pointer-events-none flex flex-col items-center gap-4">
          <div className="relative h-20 w-20">
            <div
              className={cn(
                'gradient-bg absolute inset-0 rounded-full opacity-20 blur-xl transition-all duration-300',
                isDragging && 'scale-125 opacity-40',
              )}
            />
            <div
              className={cn(
                'relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20',
                'transition-transform duration-300',
                isDragging ? 'scale-110' : 'group-hover:scale-105',
              )}
            >
              {isDragging ? (
                <FileAudio className="h-10 w-10 animate-bounce-subtle text-primary" />
              ) : (
                <Upload className="h-10 w-10 text-primary group-hover:animate-bounce-subtle" />
              )}
            </div>
          </div>

          <div className="space-y-2 text-center">
            <p className="font-semibold text-foreground text-lg md:text-xl">
              {dict.dropTitle}
            </p>
            <p className="font-medium text-primary text-sm hover:underline">
              {dict.dropDescription}
            </p>
          </div>

          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {['MP3', 'WAV', 'M4A', 'OGG', 'FLAC', 'WEBM'].map((format) => (
              <span
                className="rounded-full bg-muted px-2 py-1 font-medium text-muted-foreground text-xs"
                key={format}
              >
                {format}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-muted-foreground text-xs">{dict.or}</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="flex justify-center">
        <Button
          className={cn(
            'gap-2',
            isRecording &&
              'bg-destructive text-destructive-foreground hover:bg-destructive/90',
          )}
          disabled={disabled}
          onClick={isRecording ? stopRecording : startRecording}
          size="lg"
          variant={isRecording ? 'destructive' : 'outline'}
        >
          {isRecording ? (
            <>
              <Square className="h-4 w-4" />
              {dict.stopRecording}
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              {dict.startRecording}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
