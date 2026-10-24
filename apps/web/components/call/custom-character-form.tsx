'use client';

import { ArrowUpRight, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { emptyCustomCallDraft } from '@/data/playground-state';
import type { DBVoice } from '@/data/voices';
import { usePlaygroundState } from '@/hooks/use-playground-state';
import { callDraftStorageKey } from '@/lib/call-draft';
import type { SavedCallVoice } from '@/lib/call-voices';
import { MAX_CUSTOM_CHARACTERS, saveCharacter } from '@/lib/characters';
import { Link } from '@/lib/i18n/navigation';
import { VoicePicker } from './voice-picker';

export function CustomCharacterForm({
  callVoices,
  savedVoices,
  disabled,
  isPaidUser,
  userId,
}: {
  callVoices: DBVoice[];
  savedVoices: SavedCallVoice[];
  disabled: boolean;
  isPaidUser: boolean;
  userId: string;
}) {
  const { pgState, dispatch, selectPreset } = usePlaygroundState();
  const t = useTranslations('call.custom');
  const fields = useTranslations('call.createCharacter');
  const messages = useTranslations('call.presetSelector');
  const [saving, setSaving] = useState(false);
  const draft = pgState.customDraft ?? emptyCustomCallDraft;
  const locked = disabled || !isPaidUser || saving;
  const voiceValid = pgState.sessionConfig.audioReferenceId
    ? savedVoices.some((v) => v.id === pgState.sessionConfig.audioReferenceId)
    : callVoices.some((v) => v.name === pgState.sessionConfig.voice);
  const canSave =
    voiceValid &&
    pgState.instructions.trim() &&
    draft.name.trim() &&
    pgState.customCharacters.length < MAX_CUSTOM_CHARACTERS;
  const update = (payload: Partial<typeof draft>) =>
    dispatch({ type: 'SET_CUSTOM_DRAFT', payload });

  const save = async () => {
    if (!canSave || locked) return;
    setSaving(true);
    const result = await saveCharacter({
      name: draft.name.trim(),
      prompt: pgState.instructions,
      localizedDescriptions: { [pgState.language]: draft.description },
      localizedPrompts: { [pgState.language]: pgState.instructions },
      sessionConfig: pgState.sessionConfig,
      voiceName: pgState.sessionConfig.voice,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(messages('failedToCreate'));
      return;
    }
    dispatch({ type: 'SAVE_CUSTOM_CHARACTER', payload: result.preset });
    selectPreset(result.preset.id);
    toast.success(messages('characterCreated'));
  };

  return (
    <div className="space-y-6" data-testid="custom-character-form">
      {!isPaidUser && (
        <p className="rounded-lg bg-muted p-3 text-muted-foreground text-sm">
          {t('paidHelp')}{' '}
          <Link
            className="underline underline-offset-4"
            href="/dashboard/billing"
          >
            {t('upgrade')}
          </Link>
        </p>
      )}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium text-sm">{t('voiceHeading')}</h3>
          <Link
            aria-disabled={disabled}
            className={`inline-flex min-h-10 items-center gap-1 text-sm text-violet-400 hover:text-violet-300 focus-visible:outline-ring ${disabled ? 'pointer-events-none opacity-50' : ''}`}
            href="/dashboard/clone?for=call"
            onClick={() => {
              try {
                sessionStorage.setItem(
                  callDraftStorageKey(userId),
                  JSON.stringify({
                    ...draft,
                    instructions: pgState.instructions,
                    sessionConfig: pgState.sessionConfig,
                  }),
                );
              } catch {
                /* Browser storage may be unavailable. */
              }
            }}
            tabIndex={disabled ? -1 : undefined}
          >
            {t('cloneVoice')}
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
        <VoicePicker
          callVoices={callVoices}
          config={pgState.sessionConfig}
          disabled={locked}
          onChange={(sessionConfig) => update({ sessionConfig })}
          savedVoices={savedVoices}
        />
      </div>
      <Accordion collapsible type="single">
        <AccordionItem
          className="rounded-xl border border-separator1 px-4"
          value="personality"
        >
          <AccordionTrigger
            className="items-center hover:no-underline"
            disabled={disabled}
          >
            <span>{t('personality')}</span>
            <span className="ml-auto font-normal text-muted-foreground text-xs">
              {t(
                pgState.instructions.trim() ? 'promptAdded' : 'promptRequired',
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="custom-name">
                  {fields('nameLabel')}{' '}
                  <span className="font-normal text-muted-foreground text-xs">
                    {t('nameHelp')}
                  </span>
                </Label>
                <Input
                  disabled={locked}
                  id="custom-name"
                  maxLength={50}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder={fields('namePlaceholder')}
                  value={draft.name}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-description">
                  {fields('descriptionLabel')}{' '}
                  <span className="font-normal text-muted-foreground text-xs">
                    {t('optional')}
                  </span>
                </Label>
                <Input
                  disabled={locked}
                  id="custom-description"
                  maxLength={200}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder={fields('descriptionPlaceholder')}
                  value={draft.description}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-prompt">{t('promptLabel')}</Label>
              <Textarea
                aria-describedby="custom-prompt-help"
                disabled={locked}
                id="custom-prompt"
                maxLength={5000}
                onChange={(e) => update({ instructions: e.target.value })}
                placeholder={fields('instructionsPlaceholder')}
                rows={6}
                value={pgState.instructions}
              />
              <p
                className="text-muted-foreground text-xs"
                id="custom-prompt-help"
              >
                {t('promptHelp')}
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={locked || !canSave}
          onClick={save}
          type="button"
          variant="outline"
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          {t('saveCharacter')}
        </Button>
        <p className="text-muted-foreground text-xs">
          {t(
            pgState.customCharacters.length >= MAX_CUSTOM_CHARACTERS
              ? 'characterLimit'
              : 'saveOptional',
          )}
        </p>
      </div>
    </div>
  );
}
