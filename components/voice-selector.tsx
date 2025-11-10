'use client';
import { Info, Maximize2, Minimize2 } from 'lucide-react';
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';

import { AudioPlayer } from '@/app/[lang]/(dashboard)/dashboard/history/audio-player';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getEmotionTags } from '@/lib/ai';
import type lang from '@/lib/i18n/dictionaries/en.json';
import { resizeTextarea } from '@/lib/react-textarea-autosize';
import { capitalizeFirstLetter } from '@/lib/utils';
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
  dict,
}: {
  publicVoices: Voice[];
  selectedVoice?: Voice;
  setSelectedVoice: Dispatch<SetStateAction<string>>;
  selectedStyle?: string;
  setSelectedStyle: Dispatch<SetStateAction<string | undefined>>;
  dict: (typeof lang)['generate'];
}) {
  const isGeminiVoice = selectedVoice?.model === 'gpro';
  const [isFullscreen, setIsFullscreen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need selectedStyle
  useEffect(() => {
    // Auto-resize textarea when content changes
    if (textareaRef.current && !isFullscreen) {
      resizeTextarea(textareaRef.current, 4, 10, '--ta1-height');
    }
  }, [selectedStyle]);

  return (
    <Card>
      <CardHeader className="sm:p-6 p-4 pt-6 sm:pb-2">
        <CardTitle className="flex flex-row">
          {dict.voiceSelector.title}
          <TooltipProvider>
            <Tooltip delayDuration={100} supportMobileTap>
              <TooltipTrigger asChild>
                <Button
                  className="h-auto w-auto self-end pb-[2px]"
                  variant="link"
                  size="icon"
                >
                  <Info className="w-4 h-4 ml-2" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="whitespace-break-spaces lg:max-w-80">
                {isGeminiVoice ? (
                  <p>{dict.voiceSelector.geminiInfo}</p>
                ) : (
                  <p>
                    Model: Orpheus-TTS (text-to-speech AI model) - Commercial
                    use ✔️
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription>{dict.voiceSelector.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 sm:p-6 p-4">
        <Select value={selectedVoice?.name} onValueChange={setSelectedVoice}>
          <SelectTrigger>
            <SelectValue placeholder="Select a voice" />
          </SelectTrigger>
          <SelectContent>
            {publicVoices.length > 0 &&
              publicVoices.map((voice) => (
                <SelectItem
                  className="py-3 cursor-pointer"
                  key={voice.id}
                  value={voice.name}
                >
                  {capitalizeFirstLetter(voice.name)} | {voice.language}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {isGeminiVoice && (
          <div className="relative">
            <Textarea
              onChange={(e) => setSelectedStyle(e.target.value)}
              value={selectedStyle}
              placeholder={dict.voiceSelector.selectStyleTextareaPlaceholder}
              className="textarea-1 transition-[height] duration-200 ease-in-out"
              style={
                {
                  '--ta1-height': isFullscreen ? '30vh' : '4rem',
                } as React.CSSProperties
              }
              ref={textareaRef}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsFullscreen(!isFullscreen)}
              className={
                'absolute right-2 top-2 h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-800'
              }
              title="Fullscreen"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
        {selectedVoice?.sample_url && (
          <div className="flex gap-2 items-center justify-start py-2 lg:w-2/3">
            <AudioPlayer url={selectedVoice.sample_url} />
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground">
                <b>{capitalizeFirstLetter(selectedVoice.name)}</b> sample
                prompt: <i>{selectedVoice.sample_prompt}</i>
              </p>
              {getEmotionTags(selectedVoice.language) && (
                <TooltipProvider>
                  <Tooltip delayDuration={100} supportMobileTap>
                    <TooltipTrigger asChild>
                      <Button
                        className="h-auto w-auto p-1"
                        variant="ghost"
                        size="icon"
                      >
                        <Info className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">
                        <strong>{dict.voiceSelector.toolTipEmotionTags}</strong>
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
      </CardContent>
    </Card>
  );
}
