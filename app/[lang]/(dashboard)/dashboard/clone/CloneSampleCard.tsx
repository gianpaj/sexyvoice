import { useCallback } from 'react';

import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import type langDict from '@/lib/i18n/dictionaries/en.json';
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
  dict,
  sample,
  addFiles,
  setTextToConvert,
  setErrorMessage,
  setStatus,
}: {
  dict: (typeof langDict)['clone'];
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

  // <div
  //   className="flex flex-col border-r border-input bg-background p-2"
  // >
  return (
    // <div
    //   className="flex flex-col border-r border-input bg-background p-2"
    // >
    <AccordionItem
      className="border-b border-gray-500"
      value={sample.id.toString()}
    >
      <AccordionTrigger className="text-white text-left md:hover:text-blue-400 hover:no-underline py-5">
        {sample.name}
      </AccordionTrigger>
      <AccordionContent>
        <div className="flex my-2 justify-stretch w-full">
          <div className="flex flex-1 flex-col text-center">
            <p>{dict.sampleCard.sourceAudio}:</p>
            <AudioPlayer
              className="self-center my-2 bg-blue-950"
              url={`https://files.sexyvoice.ai/${sample.audioSrc}`}
            />
          </div>
          <div className="flex flex-1 flex-col text-center">
            <p>{dict.sampleCard.exampleOutput}:</p>
            <AudioPlayer
              className="self-center my-2 bg-purple-950"
              url={`https://files.sexyvoice.ai/${sample.audioSrc}`}
            />
          </div>
        </div>
        <Button
          key={sample.id}
          type="button"
          variant="outline"
          onClick={() => handleLoadSampleAudio(sample)}
          className="h-auto flex flex-col items-start gap-1 whitespace-normal px-3 py-2 w-fit mx-auto"
        >
          <span className="font-medium text-sm">
            {dict.sampleCard.loadSource}: {sample.name}
          </span>
          <span className="text-xs text-muted-foreground line-clamp-2">
            &quot;{sample.prompt}&quot;
          </span>
        </Button>
      </AccordionContent>
    </AccordionItem>
    // </div>
  );
}
