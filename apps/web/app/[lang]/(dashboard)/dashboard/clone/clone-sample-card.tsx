import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { AudioPlayerWithContext } from '@/components/audio-player-with-context';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { Status } from './new.client';

export interface SampleAudio {
  audioExampleOutputSrc: string;
  audioSrc: string;
  id: number;
  image: string;
  language: string;
  name: string;
  prompt: string;
}

export default function CloneSampleCard({
  sample,
  addFiles,
  onSelectSample,
  setErrorMessage,
  setStatus,
}: {
  sample: SampleAudio;
  addFiles: (files: File[]) => void;
  onSelectSample: (sample: SampleAudio) => void;
  setErrorMessage: (message: string) => void;
  setStatus: (status: Status) => void;
}) {
  const t = useTranslations('clone');
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
        onSelectSample(sampleAudio);
      } catch (err) {
        const error = err as Error;
        setErrorMessage(`Failed to load sample audio: ${error.message}`);
        setStatus('error');
      }
    },
    [addFiles],
  );

  return (
    <AccordionItem
      className="border-input border-b"
      value={sample.id.toString()}
    >
      <AccordionTrigger className="py-5 text-left text-white hover:no-underline md:hover:text-blue-400">
        {sample.name}
      </AccordionTrigger>
      <AccordionContent>
        <Card className="pb-4">
          <div className="center my-2 flex items-baseline justify-center gap-32">
            <div className="flex flex-col text-center">
              <p>{t('sampleCard.sourceAudio')}:</p>
              <AudioPlayerWithContext
                buttonClassName="bg-blue-950 hover:bg-blue-950 opacity-60 transition-opacity hover:opacity-100"
                className="my-4 self-center"
                playAudioTitle={t('playAudio')}
                progressColor="#8b5cf6"
                showWaveform
                url={`https://files.sexyvoice.ai/${sample.audioSrc}`}
                waveColor="#888888"
              />
            </div>
            <div className="my-4 flex flex-col justify-center text-center">
              <p>{t('sampleCard.exampleOutput')}:</p>
              <AudioPlayerWithContext
                buttonClassName="bg-purple-950 hover:bg-purple-950 opacity-60 transition-opacity hover:opacity-100"
                className="my-4 self-center"
                playAudioTitle={t('playAudio')}
                progressColor="#8b5cf6"
                showWaveform
                url={`https://files.sexyvoice.ai/${sample.audioExampleOutputSrc}`}
                waveColor="#888888"
              />
            </div>
          </div>
          <Button
            className="mx-auto flex h-fit gap-0 whitespace-normal p-0"
            key={sample.id}
            onClick={() => handleLoadSampleAudio(sample)}
            type="button"
            variant="outline"
          >
            <Image
              alt={sample.name}
              className="h-16 w-16 rounded-sm"
              height={65}
              src={sample.image}
              unoptimized
              width={65}
            />

            <div className="flex flex-col px-3 text-left">
              <span className="font-medium text-sm">
                {sample.name}
                {/*<span className="text-gray-500">
                {t('sampleCard.loadSource')}
              </span>*/}
              </span>
              <span className="line-clamp-2 text-muted-foreground text-xs">
                &quot;{sample.prompt}&quot;
              </span>
            </div>
          </Button>
        </Card>
      </AccordionContent>
    </AccordionItem>
  );
}
