'use client';
import { Info, Maximize2, Minimize2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';

import { AudioProvider } from '@/app/[lang]/(dashboard)/dashboard/clone/audio-provider';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { VoiceSelect } from '@/components/voice-select';
import { getEmotionTags } from '@/lib/ai';
import { resizeTextarea } from '@/lib/react-textarea-autosize';
import { capitalizeFirstLetter, getTtsProvider } from '@/lib/utils';
import { AudioPlayerWithContext } from './audio-player-with-context';
import { GrokTaggedText } from './grok-tagged-text';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

export function VoiceSelector({
  publicVoices,
  selectedVoice,
  setSelectedVoice,
  selectedStyle,
  setSelectedStyle,
}: {
  publicVoices: Tables<'voices'>[];
  selectedVoice?: Tables<'voices'>;
  setSelectedVoice: Dispatch<SetStateAction<string>>;
  selectedStyle?: string;
  setSelectedStyle: Dispatch<SetStateAction<string | undefined>>;
}) {
  const t = useTranslations('generate');
  const provider = getTtsProvider(selectedVoice?.model);
  const isGeminiVoice = provider === 'gemini';
  const isGrokVoice = provider === 'grok';
  const [isFullscreen, setIsFullscreen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need selectedStyle
  useEffect(() => {
    if (textareaRef.current && !isFullscreen) {
      resizeTextarea(textareaRef.current, 4, 10, '--ta1-height');
    }
  }, [selectedStyle]);

  return (
    <Card>
      <CardHeader className="p-4 pt-6 sm:p-6 sm:pb-2">
        <CardTitle className="flex flex-row">
          {t('voiceSelector.title')}
          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <Button
                  className="h-auto w-auto self-end pb-[2px]"
                  size="icon"
                  variant="link"
                >
                  <Info className="ml-2 h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="whitespace-break-spaces lg:max-w-80">
                {isGeminiVoice && <p>{t('voiceSelector.geminiInfo')}</p>}
                {isGrokVoice && <p>{t('voiceSelector.grokInfo')}</p>}
                {!(isGeminiVoice || isGrokVoice) && (
                  <p>
                    Model: Orpheus-TTS (text-to-speech AI model) - Commercial
                    use ✔️
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription>{t('voiceSelector.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-4 sm:p-6">
        <VoiceSelect
          onValueChange={setSelectedVoice}
          value={selectedVoice?.id}
          voices={publicVoices}
        />
        <AudioProvider>
          {selectedVoice?.sample_url && (
            <div className="flex flex-col items-center justify-start gap-4 py-2 sm:flex-row">
              <AudioPlayerWithContext
                playAudioTitle={t('playAudio')}
                showWaveform
                url={selectedVoice.sample_url}
                waveformClassName="h-5!"
              />
              <div>
                <p className="text-muted-foreground text-sm">
                  <b>{capitalizeFirstLetter(selectedVoice.name)}</b> sample
                  prompt:{' '}
                  {isGrokVoice ? (
                    <span className="whitespace-break-spaces">
                      <GrokTaggedText
                        className="inline-flex rounded bg-gray-700 px-1 py-0.5 font-mono text-gray-200 text-xs"
                        text={selectedVoice.sample_prompt ?? ''}
                      />
                    </span>
                  ) : (
                    <i>{selectedVoice.sample_prompt}</i>
                  )}
                </p>
                {getEmotionTags(selectedVoice.language) && (
                  <TooltipProvider>
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger asChild>
                        <Button
                          className="h-auto w-auto p-1"
                          size="icon"
                          variant="ghost"
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          <strong>
                            {t('voiceSelector.toolTipEmotionTags')}
                          </strong>
                          <br />
                          {getEmotionTags(selectedVoice.language)}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          )}
        </AudioProvider>
        {isGeminiVoice && (
          <div className="relative">
            <Textarea
              className="textarea-1 pr-10 transition-[height] duration-200 ease-in-out"
              data-testid="generate-style-textarea"
              onChange={(e) => setSelectedStyle(e.target.value)}
              placeholder={t('voiceSelector.selectStyleTextareaPlaceholder')}
              ref={textareaRef}
              style={
                {
                  '--ta1-height': isFullscreen ? '30vh' : '4rem',
                } as React.CSSProperties
              }
              value={selectedStyle}
            />
            <Button
              className="absolute top-2 right-2 h-8 w-8 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              onClick={() => setIsFullscreen(!isFullscreen)}
              size="icon"
              title="Fullscreen"
              variant="ghost"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
