'use client';

import { Dices, RotateCcw, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';

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
import type { GenerationSettings } from '@/hooks/use-generation-settings';
import { randomSeed, SPEECH_SETTINGS } from '@/lib/tts/generation-input';
import { getTtsModel } from '@/lib/tts/models';

interface GenerationSettingsPanelProps {
  isPaidUser: boolean;
  resetSettings: () => void;
  selectedVoice?: Tables<'voices'>;
  settings: GenerationSettings;
  updateSettings: (patch: Partial<GenerationSettings>) => void;
}

/**
 * Wraps a locked paid control: it dims and disables the control, overlays the
 * Sparkles badge, and shows an "upgrade" tooltip.
 */
function PremiumField({
  locked,
  tooltip,
  children,
}: {
  children: ReactNode;
  locked: boolean;
  tooltip: string;
}) {
  if (!locked) {
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

/**
 * A slider with a numeric readout that only commits to the (localStorage-backed)
 * settings on release. While dragging it tracks a local draft so we avoid a
 * synchronous storage write on every pointer-move tick. `value === null` means
 * "unset", rendered as `defaultLabel` and positioned at the neutral 1.
 */
function DraftSlider({
  defaultLabel,
  format,
  max,
  min,
  onCommit,
  step,
  value,
}: {
  defaultLabel: string;
  format: (value: number) => string;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  step: number;
  value: number | null;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const position = draft ?? value ?? 1;

  let readout: string;
  if (draft !== null) {
    readout = format(draft);
  } else if (value === null) {
    readout = defaultLabel;
  } else {
    readout = format(value);
  }

  return (
    <div className="flex items-center gap-3">
      <Slider
        className="flex-1"
        max={max}
        min={min}
        onValueChange={([next]) => setDraft(next)}
        onValueCommit={([next]) => {
          onCommit(next);
          setDraft(null);
        }}
        step={step}
        value={[position]}
      />
      <span className="w-16 text-right text-muted-foreground text-xs tabular-nums">
        {readout}
      </span>
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

  const honours = getTtsModel(selectedVoice?.model)?.settings;
  const upgradeTooltip = t('upgradeToUnlock');
  const locked = (setting: keyof GenerationSettings) =>
    SPEECH_SETTINGS[setting].paid && !isPaidUser;
  const { seed, speed, temperature } = SPEECH_SETTINGS;

  // Count only the settings this voice shows, so the badge matches the panel
  // and clears on reset.
  const shownSettings = (['seed', 'temperature', 'speed'] as const).filter(
    (setting) => honours?.[setting],
  );
  const activeCount = shownSettings.filter(
    (setting) => settings[setting] !== null,
  ).length;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          className="relative gap-2"
          size="sm"
          type="button"
          variant="outline"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {t('trigger')}
          {activeCount > 0 && (
            <>
              <span
                aria-hidden="true"
                className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-medium text-[10px] text-primary-foreground tabular-nums shadow-sm"
              >
                {activeCount}
              </span>
              <span className="sr-only">
                {t('activeCount', { count: activeCount })}
              </span>
            </>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        className="w-10/12 overflow-y-auto sm:max-w-md"
        side="right"
      >
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('subtitle')}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-4">
          {shownSettings.length === 0 && (
            <p className="text-muted-foreground text-sm">{t('noSettings')}</p>
          )}

          {honours?.seed && (
            <PremiumField locked={locked('seed')} tooltip={upgradeTooltip}>
              <SettingRow
                description={t('seed.description')}
                title={t('seed.label')}
              >
                <div className="flex items-center gap-2">
                  <Input
                    className="h-9"
                    inputMode="numeric"
                    min={seed.min}
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
                          : Math.max(seed.min, parsed),
                      });
                    }}
                    placeholder={t('seed.placeholder')}
                    step={1}
                    type="number"
                    value={settings.seed ?? ''}
                  />
                  <Button
                    aria-label={t('seed.randomize')}
                    className="h-9 w-9 shrink-0"
                    onClick={() => updateSettings({ seed: randomSeed() })}
                    size="icon"
                    type="button"
                    variant="secondary"
                  >
                    <Dices className="h-4 w-4" />
                  </Button>
                </div>
              </SettingRow>
            </PremiumField>
          )}

          {honours?.temperature && (
            <PremiumField
              locked={locked('temperature')}
              tooltip={upgradeTooltip}
            >
              <SettingRow
                description={t('temperature.description')}
                title={t('temperature.label')}
              >
                <DraftSlider
                  defaultLabel={t('default')}
                  format={(value) => value.toFixed(1)}
                  max={temperature.max}
                  min={temperature.min}
                  onCommit={(value) => updateSettings({ temperature: value })}
                  step={temperature.step}
                  value={settings.temperature}
                />
              </SettingRow>
            </PremiumField>
          )}

          {honours?.speed && (
            <PremiumField locked={locked('speed')} tooltip={upgradeTooltip}>
              <SettingRow
                description={t('speed.description')}
                title={t('speed.label')}
              >
                <DraftSlider
                  defaultLabel={t('default')}
                  format={(value) => `${value.toFixed(2)}×`}
                  max={speed.max}
                  min={speed.min}
                  onCommit={(value) => updateSettings({ speed: value })}
                  step={speed.step}
                  value={settings.speed}
                />
              </SettingRow>
            </PremiumField>
          )}
        </div>

        <SheetFooter>
          <Button
            className="gap-2"
            onClick={resetSettings}
            type="button"
            variant="outline"
          >
            <RotateCcw className="h-4 w-4" />
            {t('reset')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
