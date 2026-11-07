'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';

import {
  type CustomCallDraft,
  newCharacterDraft,
} from '@/data/playground-state';
import { useDeferredCharacterDelete } from '@/hooks/use-deferred-character-delete';
import { useMicrophonePermission } from '@/hooks/use-microphone-permission';
import { usePlaygroundState } from '@/hooks/use-playground-state';
import {
  SamplePlayerProvider,
  useSamplePlayer,
} from '@/hooks/use-sample-player';
import {
  type CallVoice,
  type SavedCallVoice,
  withCallVoice,
} from '@/lib/call-voices';
import {
  type Character,
  callReadiness,
  DEFAULT_SESSION_CONFIG,
  MAX_CUSTOM_CHARACTERS,
} from '@/lib/calls/characters';
import type { CallCloneProvider } from '@/lib/clone/call-voice-config';
import { CallEndedView } from './call-ended-view';
import { CallPanel } from './call-panel';
import { formatCallTime, inRoom, useCallSession } from './call-session';
import { CharacterCreator, type CreatorIntent } from './character-creator';
import { CharacterPicker } from './character-picker';

// Krisp touches browser-only APIs when it loads.
const InCallView = dynamic(
  () => import('./in-call-view').then((mod) => mod.InCallView),
  { loading: () => <div className="min-h-[calc(100dvh-12rem)]" />, ssr: false },
);

interface CallExperienceProps {
  callCloneProvider?: CallCloneProvider;
  callVoices: CallVoice[];
  /** Notices and FAQ shown under the character picker. */
  children?: ReactNode;
  /** Marks the page as rendering E2E fixtures for Playwright. */
  e2eFixtures?: boolean;
  isPaidUser: boolean;
  /** A loaded character the page link named with `?preset=`: opens its panel. */
  linkedCharacterId?: string | null;
  /** Credits summary shown above the picker on small screens. */
  mobileCredits?: ReactNode;
  /**
   * Set when the Clone page links back with `?custom=1&voice=<id>`: open the
   * creator with that saved voice.
   */
  returnFromClone?: { voiceId: string | null } | null;
  savedVoices: SavedCallVoice[];
}

export function CallExperience(props: CallExperienceProps) {
  return (
    <SamplePlayerProvider>
      <CallExperienceScreens {...props} />
    </SamplePlayerProvider>
  );
}

type View = { name: 'picker' } | { name: 'creator'; intent: CreatorIntent };

/** A new character with the voice the Clone page just saved, if found. */
function returnedCloneDraft(
  voice: SavedCallVoice | undefined,
): CustomCallDraft {
  return newCharacterDraft(
    voice
      ? withCallVoice(DEFAULT_SESSION_CONFIG, {
          name: voice.name,
          savedId: voice.id,
          provider: voice.provider,
        })
      : DEFAULT_SESSION_CONFIG,
  );
}

function CallExperienceScreens({
  callCloneProvider = 'inworld',
  callVoices,
  children,
  e2eFixtures,
  isPaidUser,
  linkedCharacterId,
  mobileCredits,
  returnFromClone,
  savedVoices: initialSavedVoices,
}: CallExperienceProps) {
  const t = useTranslations('call');
  const { pgState, dispatch, helpers, selectPreset } = usePlaygroundState();
  const { connect, dismiss, session } = useCallSession();
  const microphone = useMicrophonePermission();
  const player = useSamplePlayer();
  const { flush: flushDeletes, remove } = useDeferredCharacterDelete();

  const [savedVoices, setSavedVoices] = useState(initialSavedVoices);
  const allPresets = helpers.getAllPresets(pgState);
  const findPreset = (id: string | null) =>
    allPresets.find((preset) => preset.id === id);
  const canCreate =
    isPaidUser && pgState.customCharacters.length < MAX_CUSTOM_CHARACTERS;

  // A return from Clone reopens the creator with the draft and the new
  // voice; a link to a character opens its panel.
  const openCreatorFromClone = Boolean(returnFromClone && canCreate);
  const [view, setView] = useState<View>(() =>
    openCreatorFromClone
      ? {
          intent: {
            draft: returnedCloneDraft(
              savedVoices.find(({ id }) => id === returnFromClone?.voiceId),
            ),
            kind: 'create',
          },
          name: 'creator',
        }
      : { name: 'picker' },
  );
  const [panelOpen, setPanelOpen] = useState(
    !openCreatorFromClone && Boolean(linkedCharacterId),
  );
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const { phase } = session;
  const inCall = inRoom(phase);
  const connectingId = phase.name === 'requesting' ? phase.characterId : null;

  const showView = (next: View) => {
    player.stop();
    setPanelOpen(false);
    dismiss();
    setView(next);
    window.scrollTo({ top: 0 });
  };

  const openCreator = (intent: CreatorIntent) => {
    if (intent.kind !== 'edit') flushDeletes();
    showView({ intent, name: 'creator' });
  };

  const openPanel = (presetId: string) => {
    selectPreset(presetId);
    setHighlightId(null);
    setPanelOpen(true);
  };

  const startCall = async (characterId: string) => {
    const character = findPreset(characterId);
    if (!character) return;
    selectPreset(characterId);
    // The panel explains what is missing and how to fix it.
    if (!callReadiness(character, pgState.language, savedVoices).canCall) {
      setPanelOpen(true);
      return;
    }
    player.stop();
    const result = await connect(
      {
        characterId,
        language: pgState.language,
        sceneId: pgState.selectedSceneId,
        sceneText: pgState.sceneInstructions,
      },
      microphone.request,
    );
    if (result === 'blocked') {
      dismiss();
      setPanelOpen(true);
    } else if (result === 'started') {
      setPanelOpen(false);
    }
  };

  const handleSaved = (preset: Character, updated: boolean) => {
    dispatch({ payload: preset, type: 'SAVE_CUSTOM_CHARACTER' });
    selectPreset(preset.id);
    showView({ name: 'picker' });
    setHighlightId(preset.id);
    setPanelOpen(true);
    toast.success(
      t(updated ? 'creator.updated' : 'creator.saved', { name: preset.name }),
    );
  };

  const handleDelete = (preset: Character) => {
    remove(preset);
    if (view.name !== 'picker') showView({ name: 'picker' });
    setPanelOpen(false);
  };

  const callPreset = inRoom(phase) ? findPreset(phase.characterId) : undefined;
  const { ended } = session;
  const endedPreset = ended ? findPreset(ended.characterId) : undefined;

  let screen: ReactNode;
  if (callPreset) {
    screen = <InCallView preset={callPreset} />;
  } else if (ended && endedPreset) {
    screen = (
      <CallEndedView
        connecting={connectingId === endedPreset.id}
        duration={formatCallTime(ended.seconds)}
        onBack={dismiss}
        onCallAgain={() => startCall(endedPreset.id)}
        onEdit={() => openCreator({ kind: 'edit', presetId: endedPreset.id })}
        onRemix={
          canCreate
            ? () => openCreator({ kind: 'remix', presetId: endedPreset.id })
            : undefined
        }
        preset={endedPreset}
      />
    );
  } else if (view.name === 'creator') {
    screen = (
      <CharacterCreator
        callCloneProvider={callCloneProvider}
        callVoices={callVoices}
        intent={view.intent}
        onCall={(presetId) => {
          showView({ name: 'picker' });
          startCall(presetId).catch(() => undefined);
        }}
        onCancel={() => showView({ name: 'picker' })}
        onDelete={handleDelete}
        onSaved={handleSaved}
        onVoiceCreated={(voice) =>
          setSavedVoices((voices) => [voice, ...voices])
        }
        savedVoices={savedVoices}
      />
    );
  } else {
    screen = (
      <div className="flex flex-col gap-9">
        <div className="flex flex-col gap-1.5">
          <h1 className="font-bold text-[28px] leading-tight tracking-tight sm:text-4xl">
            {t('title')}
          </h1>
          <p className="text-base text-slate-400">{t('picker.subtitle')}</p>
        </div>
        {mobileCredits}
        <CharacterPicker
          connectingId={connectingId}
          highlightId={highlightId}
          isPaidUser={isPaidUser}
          onCall={startCall}
          onCreate={() => openCreator({ kind: 'create' })}
          onDelete={handleDelete}
          onDuplicate={(presetId) =>
            openCreator({ kind: 'duplicate', presetId })
          }
          onEdit={(presetId) => openCreator({ kind: 'edit', presetId })}
          onOpen={openPanel}
        />
        {children}
      </div>
    );
  }

  const selected = helpers.getSelectedPreset(pgState);

  return (
    <div
      className="mx-auto w-full max-w-[1120px]"
      data-e2e-call-fixtures={e2eFixtures ? '' : undefined}
      data-testid="call-experience"
    >
      {screen}
      <CallPanel
        callVoices={callVoices}
        connecting={connectingId !== null}
        isPaidUser={isPaidUser}
        microphone={microphone.status}
        onDelete={() => selected && handleDelete(selected)}
        onEdit={() =>
          selected && openCreator({ kind: 'edit', presetId: selected.id })
        }
        onOpenChange={(open) => {
          if (!open) player.stop();
          setPanelOpen(open);
        }}
        onRemix={() =>
          selected && openCreator({ kind: 'remix', presetId: selected.id })
        }
        onRetryMicrophone={() => {
          microphone.request().catch(() => undefined);
        }}
        onStartCall={() => selected && startCall(selected.id)}
        open={panelOpen && !inCall}
        savedVoices={savedVoices}
      />
    </div>
  );
}
