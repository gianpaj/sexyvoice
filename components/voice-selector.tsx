'use client';

import { Info, Maximize2, Minimize2, Search, Volume2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { AudioProvider } from '@/app/[lang]/(dashboard)/dashboard/clone/audio-provider';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';
import { VoiceCard } from './voice-card';

interface VoiceSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  publicVoices: Voice[];
  selectedVoice?: Voice;
  onSelectVoice: (voice: Voice) => void;
  dict: (typeof lang)['generate'];
}

function VoiceSelectorModal({
  open,
  onOpenChange,
  publicVoices,
  selectedVoice,
  onSelectVoice,
  dict,
}: VoiceSelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('all');

  // Extract unique languages from voices
  const languages = useMemo(() => {
    const uniqueLanguages = [
      ...new Set(publicVoices.map((voice) => voice.language)),
    ];
    return uniqueLanguages.sort();
  }, [publicVoices]);

  // Filter voices based on search and language
  const filteredVoices = useMemo(
    () =>
      publicVoices.filter((voice) => {
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch =
          voice.name.toLowerCase().includes(searchLower) ||
          (voice.sample_prompt?.toLowerCase().includes(searchLower) ?? false) ||
          (voice.tags?.some((tag) => tag.toLowerCase().includes(searchLower)) ??
            false);

        const matchesLanguage =
          selectedLanguage === 'all' || voice.language === selectedLanguage;

        return matchesSearch && matchesLanguage;
      }),
    [publicVoices, searchQuery, selectedLanguage],
  );

  const handleVoiceSelect = (voice: Voice) => {
    onSelectVoice(voice);
    onOpenChange(false);
  };

  // Reset search when modal opens
  useEffect(() => {
    if (open) {
      setSearchQuery('');
      setSelectedLanguage('all');
    }
  }, [open]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl p-0">
        <DialogHeader className="border-b p-6 pb-4">
          <DialogTitle>{dict.voiceSelector.title}</DialogTitle>
          <DialogDescription>
            {dict.voiceSelector.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-6 pt-4">
          {/* Search and Filter Row */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-10 pr-10 pl-10"
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={dict.voiceSelector.searchVoices}
                type="text"
                value={searchQuery}
              />
              {searchQuery && (
                <button
                  className="absolute top-1/2 right-3 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted-foreground/20"
                  onClick={() => setSearchQuery('')}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Language Filter */}
            <Select
              onValueChange={setSelectedLanguage}
              value={selectedLanguage}
            >
              <SelectTrigger className="h-10 w-full sm:w-[180px]">
                <SelectValue placeholder={dict.voiceSelector.allLanguages} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {dict.voiceSelector.allLanguages}
                </SelectItem>
                {languages.map((language) => (
                  <SelectItem key={language} value={language}>
                    {language}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Voice List */}
          <AudioProvider>
            <ScrollArea className="h-[400px] rounded-md border">
              <div className="space-y-2 p-4">
                {filteredVoices.length > 0 ? (
                  filteredVoices.map((voice) => (
                    <VoiceCard
                      isSelected={selectedVoice?.id === voice.id}
                      key={voice.id}
                      onSelect={handleVoiceSelect}
                      playAudioTitle={dict.playAudio}
                      voice={voice}
                    />
                  ))
                ) : (
                  <div className="py-12 text-center text-muted-foreground">
                    {dict.voiceSelector.noVoicesFound}
                  </div>
                )}
              </div>
            </ScrollArea>
          </AudioProvider>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface VoiceSelectorProps {
  publicVoices: Voice[];
  selectedVoice?: Voice;
  setSelectedVoice: (voiceName: string) => void;
  selectedStyle?: string;
  setSelectedStyle: (style: string | undefined) => void;
  dict: (typeof lang)['generate'];
}

export function VoiceSelector({
  publicVoices,
  selectedVoice,
  setSelectedVoice,
  selectedStyle,
  setSelectedStyle,
  dict,
}: VoiceSelectorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  const handleVoiceSelect = (voice: Voice) => {
    setSelectedVoice(voice.name);
  };

  return (
    <>
      <Card>
        <CardHeader className="p-4 pt-6 sm:p-6 sm:pb-2">
          <CardTitle className="flex flex-row">
            {dict.voiceSelector.title}
            <TooltipProvider>
              <Tooltip delayDuration={100} supportMobileTap>
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
        <CardContent className="space-y-4 p-4 sm:p-6">
          {/* Voice Selection Button */}
          <Button
            className="h-auto w-full justify-start p-4"
            onClick={() => setIsModalOpen(true)}
            variant="outline"
          >
            <Volume2 className="mr-3 h-5 w-5 shrink-0" />
            <div className="flex flex-col items-start text-left">
              {selectedVoice ? (
                <>
                  <span className="font-medium capitalize">
                    {selectedVoice.name}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {selectedVoice.language}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {dict.voiceSelector.title}
                </span>
              )}
            </div>
          </Button>

          {/* Emotion Tags Info for Selected Voice */}
          {selectedVoice && getEmotionTags(selectedVoice.language) && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
              <div className="flex-1">
                <p className="text-muted-foreground text-sm">
                  {dict.voiceSelector.toolTipEmotionTags}{' '}
                  {getEmotionTags(selectedVoice.language)}
                </p>
              </div>
            </div>
          )}

          {/* Style textarea for Gemini voices */}
          {isGeminiVoice && (
            <div className="relative">
              <Textarea
                className="textarea-1 pr-16 transition-[height] duration-200 ease-in-out"
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

      {/* Voice Selection Modal */}
      <VoiceSelectorModal
        dict={dict}
        onOpenChange={setIsModalOpen}
        onSelectVoice={handleVoiceSelect}
        open={isModalOpen}
        publicVoices={publicVoices}
        selectedVoice={selectedVoice}
      />
    </>
  );
}
