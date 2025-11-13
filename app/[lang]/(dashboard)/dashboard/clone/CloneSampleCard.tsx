import Image from 'next/image';
import { useCallback } from 'react';

import { AudioPlayerWithContext } from '@/components/audio-player-with-context';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Status } from './new.client';

export interface SampleAudio {
  id: number;
  name: string;
  prompt: string;
  audioSrc: string;
  audioExampleOutputSrc: string;
  image: string;
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
      className="border-gray-500 border-b"
      value={sample.id.toString()}
    >
      <AccordionTrigger className="py-5 text-left text-white hover:no-underline md:hover:text-blue-400">
        {sample.name}
      </AccordionTrigger>
      <AccordionContent>
        <div className="center my-2 flex items-baseline justify-center gap-32">
          <div className="flex flex-col text-center">
            <p>{dict.sampleCard.sourceAudio}:</p>
            <AudioPlayerWithContext
              className="my-4 self-center bg-blue-950 opacity-60 transition-opacity hover:opacity-100"
              url={`https://files.sexyvoice.ai/${sample.audioSrc}`}
            />
          </div>
          <div className="my-4 flex flex-col justify-center text-center">
            <p>{dict.sampleCard.exampleOutput}:</p>
            <AudioPlayerWithContext
              className="my-4 self-center bg-purple-950 opacity-60 transition-opacity hover:bg-purple-950 hover:opacity-100"
              url={`https://files.sexyvoice.ai/${sample.audioExampleOutputSrc}`}
            />
          </div>
        </div>
        <Button
          className="mx-auto flex h-auto w-fit gap-1 whitespace-normal px-3 py-2"
          key={sample.id}
          onClick={() => handleLoadSampleAudio(sample)}
          type="button"
          variant="outline"
        >
          <Image
            alt={sample.name}
            className="-my-2 -ml-3 m mr-2 rounded-sm"
            height={65}
            src={sample.image}
            width={65}
          />

          <div className="flex flex-col items-start self-start">
            <span className="font-medium text-sm">
              {dict.sampleCard.loadSource}: {sample.name}
            </span>
            <span className="line-clamp-2 text-muted-foreground text-xs">
              &quot;{sample.prompt}&quot;
            </span>
          </div>
        </Button>
      </AccordionContent>
    </AccordionItem>
    // </div>
  );
}
