'use client';

import { Dices, RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { generateRetrySeed } from '@/components/audio-generator/split-segments-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  GenerationSettings,
  StreamMode,
} from '@/hooks/use-generation-settings';
import { getTtsProvider } from '@/lib/utils';

interface GenerationSettingsPanelProps {
  isPaidUser: boolean;
  resetSettings: () => void;
  selectedVoice?: Tables<'voices'>;
  settings: GenerationSettings;
  updateSettings: (patch: Partial<GenerationSettings>) => void;
}

const STREAM_MODES: StreamMode[] = ['auto', 'on', 'off'];

/**
 * Wraps a block of premium-only controls: for free users it dims and disables
 * the controls, overlays the Sparkles badge, and shows an "upgrade" tooltip —
 * mirroring the treatment in `premium-action-button.tsx`.
 */
function PremiumField({
  isPaidUser,
  tooltip,
  children,
}: {
  children: ReactNode;
  isPaidUser: boolean;
  tooltip: string;
}) {
  if (isPaidUser) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className="relative">
            <div className="pointer-events-none opacity-50">{children}</div>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-linear-to-tr from-amber-500 to-yellow-400 shadow-sm"
            >
              <Sparkles className="h-2.5 w-2.5 text-white" />
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SettingRow({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function GenerationSettingsPanel({
  isPaidUser,
  resetSettings,
  selectedVoice,
  settings,
  updateSettings,
}: GenerationSettingsPanelProps) {
  const t = useTranslations('generate.advancedSettings');

  const provider = getTtsProvider(selectedVoice?.model);
  const isGeminiVoice = provider === 'gemini';
  const isGrokVoice = provider === 'grok';
  const isGemini31 = selectedVoice?.model === 'gpro31';
  const upgradeTooltip = t('upgradeToUnlock');

  const hasAnySettings = isGeminiVoice || isGrokVoice;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="gap-2" size="sm" type="button" variant="outline">
          <SlidersHorizontal className="h-4 w-4" />
          {t('trigger')}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md" side="right">
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('subtitle')}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4">
          {!hasAnySettings && (
            <p className="text-muted-foreground text-sm">{t('noSettings')}</p>
          )}

          {isGeminiVoice && (
            <>
              <PremiumField isPaidUser={isPaidUser} tooltip={upgradeTooltip}>
                <SettingRow
                  description={t('seed.description')}
                  title={t('seed.label')}
                >
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-9"
                      inputMode="numeric"
                      min={0}
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (raw === '') {
                          updateSettings({ seed: null });
                          return;
                        }
                        const parsed = Number.parseInt(raw, 10);
                        updateSettings({
                          seed: Number.isNaN(parsed)
                            ? null
                            : Math.max(0, parsed),
                        });
                      }}
                      placeholder={t('seed.placeholder')}
                      type="number"
                      value={settings.seed ?? ''}
                    />
                    <Button
                      aria-label={t('seed.randomize')}
                      className="h-9 w-9 shrink-0"
                      onClick={() =>
                        updateSettings({ seed: generateRetrySeed() })
                      }
                      size="icon"
                      type="button"
                      variant="secondary"
                    >
                      <Dices className="h-4 w-4" />
                    </Button>
                  </div>
                </SettingRow>
              </PremiumField>

              <PremiumField isPaidUser={isPaidUser} tooltip={upgradeTooltip}>
                <SettingRow
                  description={t('temperature.description')}
                  title={t('temperature.label')}
                >
                  <div className="flex items-center gap-3">
                    <Slider
                      className="flex-1"
                      max={2}
                      min={0}
                      onValueChange={([value]) =>
                        updateSettings({ temperature: value })
                      }
                      step={0.1}
                      value={[settings.temperature ?? 1]}
                    />
                    <span className="w-16 text-right text-muted-foreground text-xs tabular-nums">
                      {settings.temperature === null
                        ? t('default')
                        : settings.temperature.toFixed(1)}
                    </span>
                  </div>
                </SettingRow>
              </PremiumField>

              {isGemini31 && (
                <SettingRow
                  description={t('streaming.description')}
                  title={t('streaming.label')}
                >
                  <div className="grid grid-cols-3 gap-2">
                    {STREAM_MODES.map((mode) => (
                      <Button
                        className="h-8"
                        key={mode}
                        onClick={() => updateSettings({ streamMode: mode })}
                        size="sm"
                        type="button"
                        variant={
                          settings.streamMode === mode ? 'default' : 'outline'
                        }
                      >
                        {t(`streaming.${mode}`)}
                      </Button>
                    ))}
                  </div>
                </SettingRow>
              )}
            </>
          )}

          {isGrokVoice && (
            <SettingRow
              description={t('speed.description')}
              title={t('speed.label')}
            >
              <div className="flex items-center gap-3">
                <Slider
                  className="flex-1"
                  max={1.5}
                  min={0.7}
                  onValueChange={([value]) => updateSettings({ speed: value })}
                  step={0.05}
                  value={[settings.speed ?? 1]}
                />
                <span className="w-16 text-right text-muted-foreground text-xs tabular-nums">
                  {settings.speed === null
                    ? t('default')
                    : `${settings.speed.toFixed(2)}×`}
                </span>
              </div>
            </SettingRow>
          )}
        </div>

        <SheetFooter>
          <Button
            className="gap-2"
            onClick={resetSettings}
            type="button"
            variant="ghost"
          >
            <RotateCcw className="h-4 w-4" />
            {t('reset')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
