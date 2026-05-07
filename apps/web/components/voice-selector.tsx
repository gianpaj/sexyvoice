'use client';
import { Info, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getEmotionTags } from '@/lib/ai';
import { resizeTextarea } from '@/lib/react-textarea-autosize';
import { capitalizeFirstLetter, cn, getTtsProvider } from '@/lib/utils';
import { isFeaturedVoice } from '@/lib/voices';
import type messages from '@/messages/en.json';
import { AudioPlayerWithContext } from './audio-player-with-context';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

interface VoiceGroup {
  label: string;
  voices: Tables<'voices'>[];
}

const featuredGroupLabel = 'Grok ✨';
const geminiGroupLabel = 'Gemini 🌍';

function isMultilingualVoice(voice: Tables<'voices'>) {
  return voice.model === 'gpro';
}
function isGrokVoice(voice: Tables<'voices'>) {
  return voice.model === 'xai';
}

function sortVoices(voices: Tables<'voices'>[]) {
  return [...voices].sort((voiceA, voiceB) => {
    const isFeaturedA = isFeaturedVoice(voiceA);
    const isFeaturedB = isFeaturedVoice(voiceB);

    if (isFeaturedA && !isFeaturedB) return -1;
    if (!isFeaturedA && isFeaturedB) return 1;

    return voiceA.name.localeCompare(voiceB.name);
  });
}

function getGroupLabel(voice: Tables<'voices'>): string {
  if (isMultilingualVoice(voice)) return geminiGroupLabel;
  if (isGrokVoice(voice)) return featuredGroupLabel;
  return voice.language;
}

export function VoiceSelector({
  publicVoices,
  selectedVoice,
  setSelectedVoice,
  selectedStyle,
  setSelectedStyle,
  dict,
}: {
  publicVoices: Tables<'voices'>[];
  selectedVoice?: Tables<'voices'>;
  setSelectedVoice: Dispatch<SetStateAction<string>>;
  selectedStyle?: string;
  setSelectedStyle: Dispatch<SetStateAction<string | undefined>>;
  dict: (typeof messages)['generate'];
}) {
  const provider = useMemo(
    () => getTtsProvider(selectedVoice?.model),
    [selectedVoice?.model],
  );
  const isGeminiVoice = provider === 'gemini';
  const isGrokVoice = provider === 'grok';
  const voiceSelectorLabels =
    dict.voiceSelector as typeof dict.voiceSelector & {
      featuredBadge?: string;
    };
  const featuredBadgeLabel =
    voiceSelectorLabels.featuredBadge ?? featuredGroupLabel;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need selectedStyle
  useEffect(() => {
    // Auto-resize textarea when content changes
    if (textareaRef.current && !isFullscreen) {
      resizeTextarea(textareaRef.current, 4, 10, '--ta1-height');
    }
  }, [selectedStyle]);

  const voiceGroups = useMemo(() => {
    const featuredVoices = sortVoices(
      publicVoices.filter((voice) => isFeaturedVoice(voice)),
    );

    const nonFeaturedVoices = publicVoices.filter(
      (voice) => !isFeaturedVoice(voice),
    );

    const groupedVoices = Object.entries(
      nonFeaturedVoices.reduce(
        (acc, voice) => {
          const group = getGroupLabel(voice);

          if (!acc[group]) {
            acc[group] = [];
          }

          acc[group].push(voice);
          return acc;
        },
        {} as Record<string, Tables<'voices'>[]>,
      ),
    )
      .map(
        ([label, voices]) =>
          ({
            label,
            voices: sortVoices(voices),
          }) satisfies VoiceGroup,
      )
      .sort((groupA, groupB) => {
        if (groupA.label === geminiGroupLabel) return -1;
        if (groupB.label === geminiGroupLabel) return 1;
        return groupA.label.localeCompare(groupB.label);
      });

    const groups: VoiceGroup[] = [];

    if (featuredVoices.length > 0) {
      groups.push({
        label: featuredGroupLabel,
        voices: featuredVoices,
      });
    }

    return [...groups, ...groupedVoices];
  }, [publicVoices]);

  return (
    <Card>
      <CardHeader className="p-4 pt-6 sm:p-6 sm:pb-2">
        <CardTitle className="flex flex-row">
          {dict.voiceSelector.title}
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
                {isGeminiVoice && <p>{dict.voiceSelector.geminiInfo}</p>}
                {isGrokVoice && <p>{dict.voiceSelector.grokInfo}</p>}
                {!(isGeminiVoice || isGrokVoice) && (
                  <span>
                    Model: Orpheus-TTS (text-to-speech AI model) - Commercial
                    use ✔️
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription>{dict.voiceSelector.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-4 sm:p-6">
        <Select onValueChange={setSelectedVoice} value={selectedVoice?.name}>
          <SelectTrigger className="w-full sm:w-1/3">
            <span className="flex! items-center gap-2">
              <SelectValue placeholder="Select a voice" />
              {selectedVoice && isFeaturedVoice(selectedVoice) && (
                <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 font-semibold text-[10px] text-primary uppercase tracking-wide">
                  <Sparkles className="size-3 text-primary" />
                  {featuredBadgeLabel}
                </span>
              )}
            </span>
          </SelectTrigger>
          <SelectContent>
            {publicVoices.length > 0 &&
              voiceGroups.map(({ label, voices }) => (
                <SelectGroup key={label}>
                  <SelectLabel className="font-light">{label}</SelectLabel>
                  {voices.map((voice) => {
                    const isFeatured = isFeaturedVoice(voice);

                    return (
                      <SelectItem
                        className={cn(
                          'cursor-pointer py-3',
                          isFeatured && 'font-medium',
                        )}
                        key={voice.id}
                        value={voice.name}
                      >
                        <span className="flex items-center gap-2">
                          <span>{capitalizeFirstLetter(voice.name)}</span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              ))}
          </SelectContent>
        </Select>
        <AudioProvider>
          {selectedVoice?.sample_url && (
            <div className="flex flex-col items-center justify-start gap-4 py-2 sm:flex-row">
              <AudioPlayerWithContext
                playAudioTitle={dict.playAudio}
                showWaveform
                url={selectedVoice.sample_url}
                waveformClassName="h-5!"
              />
              <div>
                <p className="text-muted-foreground text-sm">
                  <b>{capitalizeFirstLetter(selectedVoice.name)}</b> sample
                  prompt: <i>{selectedVoice.sample_prompt}</i>
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
                            {dict.voiceSelector.toolTipEmotionTags}
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
              onChange={(e) => setSelectedStyle(e.target.value)}
              placeholder={dict.voiceSelector.selectStyleTextareaPlaceholder}
              ref={textareaRef}
              style={
                {
                  '--ta1-height': isFullscreen ? '30vh' : '4rem',
                } as React.CSSProperties
              }
              value={selectedStyle}
            />
            <Button
              className={
                'absolute top-2 right-2 h-8 w-8 text-zinc-400 hover:bg-zinc-800 hover:text-white'
              }
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
