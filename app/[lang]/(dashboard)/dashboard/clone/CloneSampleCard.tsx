import { useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { AudioPlayer } from '../history/audio-player';
import type { Status } from './new.client';

export interface SampleAudio {
  id: number;
  name: string;
  prompt: string;
  audioSrc: string;
  audioExampleOutputSrc: string;
}

export default function CloneSampleCard({
  sample,
  addFiles,
  setTextToConvert,
  setErrorMessage,
  setStatus,
}: {
  sample: SampleAudio;
  addFiles: (files: File[]) => void;
  setTextToConvert: (text: string) => void;
  setErrorMessage: (message: string) => void;
  setStatus: (status: Status) => void;
}) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: no need
  const handleLoadSampleAudio = useCallback(
    (sampleAudio: SampleAudio) => {
      const audioPath = `https://files.sexyvoice.ai/${sampleAudio.audioSrc}`;
      fetch(audioPath)
        .then((res) => res.blob())
        .then((blob) => {
          const file = new File([blob], sampleAudio.audioSrc, {
            type: 'audio/mpeg',
          });
          addFiles([file]);
          setTextToConvert(sampleAudio.prompt);
        })
        .catch((err) => {
          setErrorMessage(`Failed to load sample audio: ${err.message}`);
          setStatus('error');
        });
    },
    [addFiles],
  );

  return (
    <div
      className="flex flex-col border-r border-input bg-background p-2"
      key={sample.id}
    >
      <div className="flex flex-col">
        <p>Source audio:</p>
        <AudioPlayer
          className="self-center my-2"
          url={`https://files.sexyvoice.ai/${sample.audioSrc}`}
        />
      </div>
      <div className="flex flex-col">
        <p>Example output:</p>
        <AudioPlayer
          className="self-center my-2"
          url={`https://files.sexyvoice.ai/${sample.audioSrc}`}
        />
      </div>
      <Button
        key={sample.id}
        type="button"
        variant="outline"
        onClick={() => handleLoadSampleAudio(sample)}
        className="h-auto flex flex-col items-start gap-1 whitespace-normal px-3 py-2"
      >
        <span className="font-medium text-sm">Load source: {sample.name}</span>
        <span className="text-xs text-muted-foreground line-clamp-2">
          &quot;{sample.prompt}&quot;
        </span>
      </Button>
    </div>
  );
}
