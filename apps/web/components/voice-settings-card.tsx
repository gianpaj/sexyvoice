'use client';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';

import { AudioProvider } from '@/components/audio-provider';
import { ExpandableTextarea } from '@/components/expandable-textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { UpgradeCrown } from '@/components/upgrade-crown';
import { VoicePicker } from '@/components/voice-picker';
import { validateGenerationInput } from '@/lib/tts/generation-input';
import { getTtsModel, type TtsProvider } from '@/lib/tts/models';
import { CHARACTERS_LIMIT_GRACE } from '@/lib/ui-constants';
import { cn } from '@/lib/utils';
import { getVoiceDisplayName } from '@/lib/voice-names';
import { AudioPlayerWithContext } from './audio-player-with-context';
import { GrokTaggedText } from './grok-tagged-text';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

const MODEL_INFO_KEYS = {
  gemini: 'voiceSelector.geminiInfo',
  grok: 'voiceSelector.grokInfo',
  replicate: 'voiceSelector.orpheusInfo',
} as const satisfies Record<TtsProvider, string>;

export function VoiceSettingsCard({
  publicVoices,
  selectedVoice,
  setSelectedVoice,
  selectedStyle,
  setSelectedStyle,
  isPaidUser = false,
}: {
  publicVoices: Tables<'voices'>[];
  selectedVoice?: Tables<'voices'>;
  setSelectedVoice: Dispatch<SetStateAction<string>>;
  selectedStyle?: string;
  setSelectedStyle: Dispatch<SetStateAction<string | undefined>>;
  isPaidUser?: boolean;
}) {
  const t = useTranslations('generate');
  const ttsModel = getTtsModel(selectedVoice?.model);
  const isGrokVoice = ttsModel?.provider === 'grok';
  const emotionTags =
    selectedVoice && ttsModel
      ? ttsModel.inlineTags(selectedVoice.language)
      : undefined;
  const styleCheck = ttsModel
    ? validateGenerationInput(ttsModel, { isPaidUser, style: selectedStyle })
    : null;
  const styleCharacterLimit = styleCheck?.styleLimit ?? null;
  const styleLength = selectedStyle?.length ?? 0;

  return (
    <Card>
      <CardHeader>
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
                {ttsModel && <p>{t(MODEL_INFO_KEYS[ttsModel.provider])}</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
        <CardDescription>{t('voiceSelector.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <VoicePicker
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
                  <b>{getVoiceDisplayName(selectedVoice)}</b> sample prompt:{' '}
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
                {emotionTags && (
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
                          {emotionTags}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          )}
        </AudioProvider>
        {styleCharacterLimit !== null && (
          <div className="relative">
            <ExpandableTextarea
              className="pr-10"
              compactHeight="4rem"
              data-testid="generate-style-textarea"
              maxLength={styleCharacterLimit + CHARACTERS_LIMIT_GRACE}
              minRows={4}
              onChange={(e) => setSelectedStyle(e.target.value)}
              placeholder={t('voiceSelector.selectStyleTextareaPlaceholder')}
              value={selectedStyle}
            />
            <div
              className={cn(
                'flex items-center justify-end gap-1.5 text-muted-foreground text-sm',
                styleCheck?.styleTooLong && 'text-red-500',
              )}
            >
              <p
                className="mt-1 text-right"
                data-testid="generate-style-character-count"
              >
                {styleLength}/{styleCharacterLimit}
              </p>
              <UpgradeCrown
                paid={isPaidUser}
                tooltip={
                  isPaidUser
                    ? t('paidStyleLimitTooltip')
                    : t('upgradeStyleLimitTooltip')
                }
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
