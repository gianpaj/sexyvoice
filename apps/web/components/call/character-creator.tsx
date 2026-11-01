'use client';

import { ArrowLeft, Loader2, PhoneCall } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { CALL_PERSONALITY_EXAMPLES } from '@/data/call-personality-examples';
import { defaultSessionConfig } from '@/data/default-config';
import type { CustomCallDraft } from '@/data/playground-state';
import type { Preset } from '@/data/presets';
import type { DBVoice } from '@/data/voices';
import { usePlaygroundState } from '@/hooks/use-playground-state';
import { useSamplePlayer } from '@/hooks/use-sample-player';
import {
  type SavedCallVoice,
  savedVoiceSampleUrl,
  withCallVoice,
} from '@/lib/call-voices';
import {
  buildSaveCharacterPayload,
  getPresetDescription,
  getPresetInstructions,
  saveCharacter,
} from '@/lib/characters';
import type { CallCloneProvider } from '@/lib/clone/call-voice-config';
import { cn } from '@/lib/utils';
import { CharacterAvatar } from './character-avatar';
import { CloneVoiceDialog } from './clone-voice-dialog';
import { ListenButton } from './listen-button';
import { VoicePicker } from './voice-picker';

const MAX_NAME_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_PERSONALITY_LENGTH = 5000;

/** What the creator opens with. Edit, duplicate and remix name a character. */
export type CreatorIntent =
  | { kind: 'create'; draft?: CustomCallDraft }
  | { kind: 'edit' | 'duplicate' | 'remix'; presetId: string };

interface CharacterCreatorProps {
  callCloneProvider: CallCloneProvider;
  callVoices: DBVoice[];
  intent: CreatorIntent;
  /** Starts a call with a saved character, like its card's Call. */
  onCall: (presetId: string) => void;
  onCancel: () => void;
  onDelete: (preset: Preset) => void;
  onSaved: (preset: Preset, updated: boolean) => void;
  /** Adds a voice cloned from the creator to the saved list. */
  onVoiceCreated: (voice: SavedCallVoice) => void;
  savedVoices: SavedCallVoice[];
}

const inputClass =
  'h-[46px] w-full rounded-[10px] border bg-slate-950/70 px-3.5 text-[15px] text-slate-50 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-violet-400';

function Section({
  children,
  labelledBy,
}: {
  children: ReactNode;
  labelledBy: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className="flex flex-col gap-[18px] rounded-2xl border border-slate-800/80 bg-slate-950/50 p-[18px] sm:p-6"
    >
      {children}
    </section>
  );
}

function StepBadge({ step }: { step: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-violet-950 font-bold text-[13px] text-violet-300"
    >
      {step}
    </span>
  );
}

export function CharacterCreator({
  callCloneProvider,
  callVoices,
  intent,
  onCall,
  onCancel,
  onDelete,
  onSaved,
  onVoiceCreated,
  savedVoices,
}: CharacterCreatorProps) {
  const t = useTranslations('call.creator');
  const { pgState, helpers } = usePlaygroundState();
  const player = useSamplePlayer();
  const language = pgState.language;
  const source =
    intent.kind === 'create'
      ? undefined
      : helpers
          .getAllPresets(pgState)
          .find((preset) => preset.id === intent.presetId);
  const editing = intent.kind === 'edit' ? source : undefined;

  const [form, setForm] = useState<CustomCallDraft>(() => {
    if (intent.kind === 'create') {
      return (
        intent.draft ?? {
          description: '',
          instructions: '',
          name: '',
          sessionConfig: { ...defaultSessionConfig },
        }
      );
    }
    if (!source) {
      return {
        description: '',
        instructions: '',
        name: '',
        sessionConfig: { ...defaultSessionConfig },
      };
    }
    const names = {
      duplicate: t('copyName', { name: source.name }),
      edit: source.name,
      remix: t('remixName', { name: source.name }),
    };
    return {
      description: getPresetDescription(source, language),
      // Public prompts stay on the server, so a remix starts without one.
      instructions:
        intent.kind === 'remix' ? '' : getPresetInstructions(source, language),
      name: names[intent.kind].slice(0, MAX_NAME_LENGTH),
      sessionConfig: { ...source.sessionConfig },
    };
  });
  // Copies start dirty: leaving one discards a character the user has not
  // saved yet.
  const [dirty, setDirty] = useState(
    intent.kind === 'duplicate' ||
      intent.kind === 'remix' ||
      Boolean(intent.kind === 'create' && intent.draft),
  );
  const [triedSave, setTriedSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [newVoiceId, setNewVoiceId] = useState<string | null>(null);

  const update = (patch: Partial<CustomCallDraft>) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const name = form.name.trim();
  const nameMissing = !name;
  const personalityMissing = !form.instructions.trim();
  const { sessionConfig } = form;
  const savedVoice = sessionConfig.audioReferenceId
    ? savedVoices.find((v) => v.id === sessionConfig.audioReferenceId)
    : undefined;
  const builtInVoice = sessionConfig.audioReferenceId
    ? undefined
    : callVoices.find((v) => v.name === sessionConfig.voice);
  const voiceValid = Boolean(savedVoice ?? builtInVoice);
  const complete = !(nameMissing || personalityMissing) && voiceValid;
  // Only a saved character without edits can call; the panel uses what is
  // saved, not this form.
  const canCall = Boolean(editing && !dirty && complete);

  let hint = t('ready', { name });
  if (nameMissing && personalityMissing) hint = t('missingNameAndPersonality');
  else if (nameMissing) hint = t('missingName');
  else if (personalityMissing) hint = t('missingPersonality');
  else if (!voiceValid) hint = t('missingVoice');

  const voiceDescription = savedVoice
    ? t('clonedVoice')
    : (builtInVoice?.description ?? builtInVoice?.type ?? '');
  const voiceSampleUrl = savedVoice
    ? savedVoiceSampleUrl(savedVoice.id)
    : (builtInVoice?.sample_url ?? null);
  const previewPlaying = player.playingKey === 'creator-preview';
  const togglePreview = () => player.toggle('creator-preview', voiceSampleUrl);

  const applyExample = (key: (typeof CALL_PERSONALITY_EXAMPLES)[number]) => {
    const previous = form;
    const label = t(`examples.${key}.label`);
    update({
      description: form.description.trim()
        ? form.description
        : t(`examples.${key}.tagline`),
      instructions: t(`examples.${key}.text`),
    });
    if (previous.instructions.trim()) {
      toast(t('exampleReplaced', { label }), {
        action: { label: t('undo'), onClick: () => setForm(previous) },
      });
    }
  };

  const leave = () => {
    if (dirty) {
      setConfirmLeave(true);
      return;
    }
    onCancel();
  };

  const save = async () => {
    if (!complete) {
      setTriedSave(true);
      return;
    }
    setSaving(true);
    // Public characters are never a base: their prompts stay on the server.
    const base =
      intent.kind !== 'remix' && !source?.isPublic ? source : undefined;
    const result = await saveCharacter(
      buildSaveCharacterPayload({
        base,
        description: form.description.trim(),
        instructions: form.instructions,
        language,
        name,
        sessionConfig,
        update: Boolean(editing),
      }),
    );
    setSaving(false);
    if (!result.ok) {
      toast.error(t('saveFailed', { name }));
      return;
    }
    player.stop();
    onSaved(result.preset, Boolean(editing));
  };

  const fieldError = 'text-[13px] text-red-300';
  const preview = (
    <div className="flex min-h-[200px] flex-col justify-between gap-[18px] rounded-[14px] border border-slate-800 bg-slate-900/70 p-[18px]">
      <div className="flex flex-col items-start gap-3">
        <CharacterAvatar name={form.name} seed={editing?.id ?? form.name} />
        <div className="flex flex-col gap-0.5">
          <span
            className={cn(
              'font-semibold text-[17px]',
              name ? 'text-slate-50' : 'text-slate-500',
            )}
          >
            {name || t('previewName')}
          </span>
          <span
            className={cn(
              'text-sm',
              form.description.trim() ? 'text-slate-400' : 'text-slate-500',
            )}
          >
            {form.description.trim() || t('previewDescription')}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <ListenButton
          ariaLabel={previewPlaying ? t('stopVoice') : t('hearVoice')}
          disabled={!voiceSampleUrl}
          label={previewPlaying ? t('stop') : t('listen')}
          onClick={togglePreview}
          playing={previewPlaying}
        />
        <button
          className="inline-flex h-11 items-center gap-2 rounded-[10px] bg-violet-700 px-[18px] font-semibold text-sm text-white transition-colors hover:bg-violet-600 focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-55"
          disabled={!canCall}
          onClick={() => editing && onCall(editing.id)}
          type="button"
        >
          <PhoneCall aria-hidden="true" className="size-[15px]" />
          {t('call')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col" data-testid="character-creator">
      <div className="flex flex-col gap-5 pb-6">
        <div className="flex flex-col items-start gap-2">
          <button
            className="-ml-1.5 inline-flex h-9 items-center gap-2 rounded-lg pr-2.5 pl-1.5 font-medium text-sm text-violet-300 hover:bg-violet-950/40"
            onClick={leave}
            type="button"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            {t('back')}
          </button>
          <h1 className="font-bold text-[28px] leading-tight tracking-tight sm:text-4xl">
            {editing
              ? t('editTitle', { name: editing.name })
              : t('createTitle')}
          </h1>
        </div>

        <div className="flex flex-wrap items-start gap-8">
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
            <div className="flex items-center gap-3 rounded-[14px] border border-slate-800 bg-slate-900/70 p-3 lg:hidden">
              <CharacterAvatar
                name={form.name}
                seed={editing?.id ?? form.name}
                size="sm"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    'truncate font-semibold',
                    name ? 'text-slate-50' : 'text-slate-500',
                  )}
                >
                  {name || t('previewName')}
                </span>
                <span className="truncate text-[13px] text-slate-400">
                  {t('previewVoice', { voice: sessionConfig.voice })}
                </span>
              </div>
              <ListenButton
                ariaLabel={previewPlaying ? t('stopVoice') : t('hearVoice')}
                disabled={!voiceSampleUrl}
                onClick={togglePreview}
                playing={previewPlaying}
              />
            </div>

            <Section labelledBy="creator-who">
              <div className="flex items-center gap-2.5">
                <StepBadge step={1} />
                <h2 className="font-semibold text-lg" id="creator-who">
                  {t('whoIsIt')}
                </h2>
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label
                    className="font-semibold text-slate-200 text-sm"
                    htmlFor="creator-name"
                  >
                    {t('name')}
                  </label>
                  <input
                    aria-describedby={
                      triedSave && nameMissing
                        ? 'creator-name-error'
                        : undefined
                    }
                    aria-invalid={triedSave && nameMissing}
                    className={cn(
                      inputClass,
                      triedSave && nameMissing
                        ? 'border-red-400'
                        : 'border-slate-700/70',
                    )}
                    id="creator-name"
                    maxLength={MAX_NAME_LENGTH}
                    onChange={(e) => update({ name: e.target.value })}
                    placeholder={t('namePlaceholder')}
                    type="text"
                    value={form.name}
                  />
                  {triedSave && nameMissing && (
                    <p className={fieldError} id="creator-name-error">
                      {t('nameError')}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <label
                      className="font-semibold text-slate-200 text-sm"
                      htmlFor="creator-description"
                    >
                      {t('description')}
                    </label>
                    <span className="text-[13px] text-slate-500">
                      {t('optional')}
                    </span>
                  </div>
                  <input
                    aria-describedby="creator-description-help"
                    className={cn(inputClass, 'border-slate-700/70')}
                    id="creator-description"
                    maxLength={MAX_DESCRIPTION_LENGTH}
                    onChange={(e) => update({ description: e.target.value })}
                    placeholder={t('descriptionPlaceholder')}
                    type="text"
                    value={form.description}
                  />
                  <p
                    className="text-[13px] text-slate-500"
                    id="creator-description-help"
                  >
                    {t('descriptionHelp')}
                  </p>
                </div>
              </div>
            </Section>

            <Section labelledBy="creator-personality-heading">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2.5">
                  <StepBadge step={2} />
                  <h2
                    className="font-semibold text-lg"
                    id="creator-personality-heading"
                  >
                    <label htmlFor="creator-personality">
                      {t('personality')}
                    </label>
                  </h2>
                </div>
                <p
                  className="pl-9 text-slate-400 text-sm"
                  id="creator-personality-help"
                >
                  {t('personalityHelp')}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[13px] text-slate-500">
                  {t('startFromExample')}
                </span>
                <div className="flex flex-wrap gap-2">
                  {CALL_PERSONALITY_EXAMPLES.map((key) => (
                    <button
                      className="h-10 rounded-full border border-violet-900 bg-violet-950/50 px-4 font-medium text-sm text-violet-100 transition-colors hover:bg-violet-950"
                      key={key}
                      onClick={() => applyExample(key)}
                      type="button"
                    >
                      {t(`examples.${key}.label`)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <textarea
                  aria-describedby={
                    triedSave && personalityMissing
                      ? 'creator-personality-help creator-personality-error'
                      : 'creator-personality-help'
                  }
                  aria-invalid={triedSave && personalityMissing}
                  className={cn(
                    'min-h-[220px] w-full resize-y rounded-xl border bg-slate-950/70 p-3.5 text-[15px] text-slate-50 leading-relaxed placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-violet-400',
                    triedSave && personalityMissing
                      ? 'border-red-400'
                      : 'border-slate-700/70',
                  )}
                  id="creator-personality"
                  maxLength={MAX_PERSONALITY_LENGTH}
                  onChange={(e) => update({ instructions: e.target.value })}
                  placeholder={t('personalityPlaceholder')}
                  rows={9}
                  value={form.instructions}
                />
                <div className="flex items-center justify-between gap-2">
                  {triedSave && personalityMissing && (
                    <p className={fieldError} id="creator-personality-error">
                      {t('personalityError')}
                    </p>
                  )}
                  <span className="ml-auto text-[13px] text-slate-500 tabular-nums">
                    {t('characterCount', {
                      count: form.instructions.length,
                      max: MAX_PERSONALITY_LENGTH,
                    })}
                  </span>
                </div>
              </div>
            </Section>

            <Section labelledBy="creator-voice">
              <div className="flex items-center gap-2.5">
                <StepBadge step={3} />
                <h2 className="font-semibold text-lg" id="creator-voice">
                  {t('voice')}
                </h2>
              </div>
              <VoicePicker
                callVoices={callVoices}
                config={sessionConfig}
                labelledBy="creator-voice"
                newVoiceId={newVoiceId}
                onChange={(config) => update({ sessionConfig: config })}
                onCloneVoice={() => {
                  player.stop();
                  setCloneOpen(true);
                }}
                savedVoices={savedVoices}
              />
              {triedSave && !voiceValid && (
                <p className={fieldError}>{t('missingVoice')}</p>
              )}
            </Section>
          </div>

          <aside
            aria-label={t('preview')}
            className="sticky top-6 hidden max-w-[360px] flex-[1_1_300px] flex-col gap-3 lg:flex"
          >
            <span className="font-semibold text-violet-300 text-xs uppercase tracking-[0.12em]">
              {t('preview')}
            </span>
            {preview}
            <p className="text-[13px] text-slate-500">
              {voiceDescription
                ? t('previewVoiceWithDescription', {
                    description: voiceDescription,
                    voice: sessionConfig.voice,
                  })
                : t('previewVoice', { voice: sessionConfig.voice })}
            </p>
          </aside>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-slate-800 border-t bg-background/95 backdrop-blur sm:-mx-6 lg:-mx-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-6 lg:px-8">
          <p
            aria-live="polite"
            className={cn(
              'flex-[1_1_260px] text-sm',
              complete && 'text-green-300',
              !complete && triedSave && 'text-red-300',
              !(complete || triedSave) && 'text-slate-400',
            )}
          >
            {hint}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            {editing && (
              <Button
                className="h-11 text-red-300 hover:bg-red-950/40 hover:text-red-200"
                onClick={() => onDelete(editing)}
                type="button"
                variant="ghost"
              >
                {t('delete')}
              </Button>
            )}
            <Button
              className="h-11"
              onClick={leave}
              type="button"
              variant="outline"
            >
              {t('cancel')}
            </Button>
            <Button
              className="h-11 bg-violet-700 px-[22px] font-semibold text-white hover:bg-violet-600"
              disabled={saving}
              onClick={save}
              type="button"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editing ? t('saveChanges') : t('save')}
            </Button>
          </div>
        </div>
      </div>

      <CloneVoiceDialog
        callCloneProvider={callCloneProvider}
        language={language}
        onCreated={onVoiceCreated}
        onOpenChange={setCloneOpen}
        onUseVoice={(voice) => {
          update({
            sessionConfig: withCallVoice(sessionConfig, {
              name: voice.name,
              savedId: voice.id,
              provider: voice.provider,
            }),
          });
          setNewVoiceId(voice.id);
        }}
        open={cloneOpen}
        savedCount={savedVoices.length}
      />

      <AlertDialog onOpenChange={setConfirmLeave} open={confirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {editing ? t('discardEditTitle') : t('discardNewTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {editing ? t('discardEditBody') : t('discardNewBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-700 text-white hover:bg-red-600"
              onClick={() => {
                player.stop();
                onCancel();
              }}
            >
              {t('discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
