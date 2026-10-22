'use client';

import { Check, Mic } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { defaultSessionConfig } from '@/data/default-config';
import { ModelId } from '@/data/models';
import type { SessionConfig } from '@/data/session-config';
import type { DBVoice } from '@/data/voices';
import type { SavedCallVoice } from '@/lib/call-voices';
import { cn } from '@/lib/utils';
import { VoicePlayButton } from './voice-play-button';

interface VoicePickerProps {
  callVoices: DBVoice[];
  config: SessionConfig;
  disabled: boolean;
  onChange: (config: SessionConfig) => void;
  savedVoices: SavedCallVoice[];
}

export function VoicePicker({
  callVoices,
  savedVoices,
  config,
  disabled,
  onChange,
}: VoicePickerProps) {
  const t = useTranslations('call.custom');
  const preview = useTranslations('call.createCharacter');
  const [tab, setTab] = useState(config.audioReferenceId ? 'saved' : 'builtin');
  const voices =
    tab === 'saved'
      ? savedVoices.map((v) => ({
          id: v.id,
          name: v.name,
          description: v.locale ?? '',
          sampleUrl: `/api/audio-references/${v.id}/sample`,
          saved: true,
        }))
      : callVoices.map((v) => ({
          id: v.id,
          name: v.name,
          description: v.description ?? v.type ?? '',
          sampleUrl: v.sample_url,
          saved: false,
        }));

  return (
    <Tabs onValueChange={setTab} value={tab}>
      <TabsList aria-label={t('voiceSources')} className="mb-3" variant="line">
        <TabsTrigger value="builtin">{t('builtIn')}</TabsTrigger>
        <TabsTrigger value="saved">
          {t('myVoices')}
          {savedVoices.length > 0 && (
            <span aria-hidden="true" className="text-xs tabular-nums">
              {savedVoices.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent key={tab} value={tab}>
        {voices.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {voices.map((voice) => {
              const selected = voice.saved
                ? config.audioReferenceId === voice.id
                : !config.audioReferenceId && config.voice === voice.name;
              return (
                <div
                  className={cn(
                    'relative flex min-h-28 rounded-xl border bg-muted/20 transition-colors',
                    selected
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-separator1 hover:bg-muted/40',
                  )}
                  key={voice.id}
                >
                  <button
                    aria-label={voice.name}
                    aria-pressed={selected}
                    className="flex min-w-0 flex-1 flex-col items-start gap-2 rounded-xl p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...config,
                        audioReferenceId: voice.saved ? voice.id : undefined,
                        model: voice.saved
                          ? ModelId.MISTRAL_TTS
                          : defaultSessionConfig.model,
                        voice: voice.name,
                      })
                    }
                    type="button"
                  >
                    <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      {selected ? (
                        <Check className="size-4 text-violet-400" />
                      ) : (
                        <Mic className="size-4" />
                      )}
                    </span>
                    <span
                      className="line-clamp-2 w-full break-words font-medium text-sm"
                      title={voice.name}
                    >
                      {voice.name}
                    </span>
                    <span className="line-clamp-2 text-muted-foreground text-xs">
                      {voice.description}
                    </span>
                  </button>
                  <VoicePlayButton
                    ariaLabels={{
                      play: preview('playVoiceSample'),
                      stop: preview('stopVoiceSample'),
                    }}
                    className="absolute top-3 right-2 min-h-10 min-w-10 border-0 bg-transparent"
                    key={voice.sampleUrl}
                    prefetch={false}
                    sampleUrl={voice.sampleUrl}
                    title={preview('previewVoice').replace(
                      '__VOICE__',
                      voice.name,
                    )}
                    voiceName={voice.name}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-separator1 border-dashed px-6 py-10 text-center">
            <Mic className="mx-auto mb-3 size-6 text-muted-foreground" />
            <p className="font-medium text-sm">
              {t(tab === 'saved' ? 'noVoices' : 'noBuiltInVoices')}
            </p>
            {tab === 'saved' && (
              <p className="mt-1 text-muted-foreground text-sm">
                {t('noVoicesHelp')}
              </p>
            )}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
