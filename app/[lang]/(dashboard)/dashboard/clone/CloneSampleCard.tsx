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
    async (sampleAudio: SampleAudio) => {
      try {
        // we need a local file otherwise we have a CORS error with R2 on https://files.sexyvoice.ai
        const localPath = sampleAudio.audioSrc.replace(
          'clone-en-audio-samples/',
          '',
        );
        const audioPath = `/sv-samples/${localPath}`;
        const res = await fetch(audioPath);

        if (!res.ok) {
          throw new Error(`Failed to fetch audio: ${res.statusText}`);
        }

        const blob = await res.blob();

        // Use the blob's actual type if available, otherwise infer from filename
        let mimeType = blob.type;
        if (!mimeType || mimeType === 'application/octet-stream') {
          const extension = sampleAudio.audioSrc
            .split('.')
            .pop()
            ?.toLowerCase();
          if (extension === 'mp3') {
            mimeType = 'audio/mpeg';
          } else if (extension === 'wav') {
            mimeType = 'audio/wav';
          } else if (extension === 'm4a') {
            mimeType = 'audio/mp4';
          } else {
            mimeType = 'audio/mpeg'; // default
          }
        }

        const file = new File([blob], sampleAudio.audioSrc, {
          type: mimeType,
        });

        addFiles([file]);
        setTextToConvert(sampleAudio.prompt);
      } catch (err) {
        const error = err as Error;
        setErrorMessage(`Failed to load sample audio: ${error.message}`);
        setStatus('error');
      }
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
          className="m-0 mx-auto flex h-auto w-fit gap-0 whitespace-normal p-0 shadow-none"
          key={sample.id}
          onClick={() => handleLoadSampleAudio(sample)}
          type="button"
          variant="outline"
        >
          <Image
            alt={sample.name}
            className="rounded-sm"
            height={65}
            src={sample.image}
            width={65}
          />

          <div className="flex flex-col items-start self-center px-3 text-left">
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
