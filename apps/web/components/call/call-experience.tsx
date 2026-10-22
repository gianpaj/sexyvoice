'use client';

import { useConnectionState } from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { defaultSessionConfig } from '@/data/default-config';
import type { CustomCallDraft } from '@/data/playground-state';
import type { Preset } from '@/data/presets';
import type { DBVoice } from '@/data/voices';
import { useCallTimer } from '@/hooks/use-call-timer';
import { useConnection } from '@/hooks/use-connection';
import { useDeferredCharacterDelete } from '@/hooks/use-deferred-character-delete';
import { useMicrophonePermission } from '@/hooks/use-microphone-permission';
import { usePlaygroundState } from '@/hooks/use-playground-state';
import {
  SamplePlayerProvider,
  useSamplePlayer,
} from '@/hooks/use-sample-player';
import { callDraftStorageKey, customCallDraftSchema } from '@/lib/call-draft';
import { type SavedCallVoice, withCallVoice } from '@/lib/call-voices';
import { MAX_CUSTOM_CHARACTERS } from '@/lib/characters';
import { useRouter } from '@/lib/i18n/navigation';
import { CallEndedView } from './call-ended-view';
import { CallPanel } from './call-panel';
import { CharacterCreator, type CreatorIntent } from './character-creator';
import { CharacterPicker } from './character-picker';

// Krisp touches browser-only APIs when it loads.
const InCallView = dynamic(
  () => import('./in-call-view').then((mod) => mod.InCallView),
  { loading: () => <div className="min-h-[calc(100dvh-12rem)]" />, ssr: false },
);

interface CallExperienceProps {
  callVoices: DBVoice[];
  /** Notices and FAQ shown under the character picker. */
  children?: ReactNode;
  isPaidUser: boolean;
  /** Credits summary shown above the picker on small screens. */
  mobileCredits?: ReactNode;
  savedVoices: SavedCallVoice[];
  userId: string;
}

export function CallExperience(props: CallExperienceProps) {
  return (
    <SamplePlayerProvider>
      <CallExperienceScreens {...props} />
    </SamplePlayerProvider>
  );
}

type View = { name: 'picker' } | { name: 'creator'; intent: CreatorIntent };

/** Reads a draft saved before leaving for the Clone page, once. */
function takeClonedDraft(
  userId: string,
  savedVoices: SavedCallVoice[],
): CustomCallDraft | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('custom') !== '1') return null;
  let draft: CustomCallDraft | null = null;
  try {
    const stored = sessionStorage.getItem(callDraftStorageKey(userId));
    const parsed = customCallDraftSchema.safeParse(
      stored ? JSON.parse(stored) : null,
    );
    if (parsed.success) draft = parsed.data;
    sessionStorage.removeItem(callDraftStorageKey(userId));
  } catch {
    /* Browser storage may be unavailable. */
  }
  const base = draft ?? {
    description: '',
    instructions: '',
    name: '',
    sessionConfig: { ...defaultSessionConfig },
  };
  const voice = savedVoices.find((v) => v.id === params.get('voice'));
  return voice
    ? {
        ...base,
        sessionConfig: withCallVoice(base.sessionConfig, {
          name: voice.name,
          savedId: voice.id,
        }),
      }
    : base;
}

function CallExperienceScreens({
  callVoices,
  children,
  isPaidUser,
  mobileCredits,
  savedVoices,
  userId,
}: CallExperienceProps) {
  const t = useTranslations('call');
  const { pgState, dispatch, helpers, selectPreset } = usePlaygroundState();
  const { connect, shouldConnect } = useConnection();
  const connectionState = useConnectionState();
  const { formattedTime } = useCallTimer(connectionState);
  const microphone = useMicrophonePermission();
  const player = useSamplePlayer();
  const { remove } = useDeferredCharacterDelete();
  const router = useRouter();

  const [view, setView] = useState<View>({ name: 'picker' });
  const [panelOpen, setPanelOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [callPresetId, setCallPresetId] = useState<string | null>(null);
  const [ended, setEnded] = useState<{
    duration: string;
    presetId: string;
  } | null>(null);
  const [connecting, setConnecting] = useState(false);

  const allPresets = helpers.getAllPresets(pgState);
  const findPreset = (id: string | null) =>
    allPresets.find((preset) => preset.id === id);
  const canCreate =
    isPaidUser && pgState.customCharacters.length < MAX_CUSTOM_CHARACTERS;

  // A call shows from a successful token request until LiveKit disconnects.
  // The last connected duration outlives the timer, which resets to zero.
  const inCall =
    callPresetId !== null &&
    (shouldConnect || connectionState !== ConnectionState.Disconnected);
  const lastDuration = useRef('');
  const reachedConnected = useRef(false);
  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      reachedConnected.current = true;
      lastDuration.current = formattedTime;
    }
  }, [connectionState, formattedTime]);
  useEffect(() => {
    if (inCall || callPresetId === null) return;
    if (reachedConnected.current) {
      setEnded({ duration: lastDuration.current, presetId: callPresetId });
    }
    reachedConnected.current = false;
    setCallPresetId(null);
  }, [inCall, callPresetId]);

  const showView = (next: View) => {
    player.stop();
    setPanelOpen(false);
    setEnded(null);
    setView(next);
    window.scrollTo({ top: 0 });
  };

  const openCreator = (intent: CreatorIntent) =>
    showView({ intent, name: 'creator' });

  const openPanel = (presetId: string) => {
    selectPreset(presetId);
    setHighlightId(null);
    setPanelOpen(true);
  };

  // Links to a character open its panel; a return from Clone reopens the
  // creator with the draft and the new voice.
  // biome-ignore lint/correctness/useExhaustiveDependencies: initial URL only
  useEffect(() => {
    const draft = takeClonedDraft(userId, savedVoices);
    if (draft && canCreate) {
      setView({ intent: { draft, kind: 'create' }, name: 'creator' });
      return;
    }
    const presetId = helpers.getPresetIdFromUrlParams(window.location.search);
    if (findPreset(presetId)) setPanelOpen(true);
  }, []);

  const startCall = async () => {
    if (connecting) return;
    const presetId = pgState.selectedPresetId;
    setConnecting(true);
    try {
      if (!(await microphone.request())) {
        setEnded(null);
        setPanelOpen(true);
        return;
      }
      player.stop();
      await connect();
      setCallPresetId(presetId);
      setEnded(null);
      setPanelOpen(false);
    } catch (error) {
      console.error('Connection failed:', error);
    } finally {
      setConnecting(false);
    }
  };

  const handleSaved = (preset: Preset, updated: boolean) => {
    dispatch({ payload: preset, type: 'SAVE_CUSTOM_CHARACTER' });
    selectPreset(preset.id);
    showView({ name: 'picker' });
    setHighlightId(preset.id);
    setPanelOpen(true);
    toast.success(
      t(updated ? 'creator.updated' : 'creator.saved', { name: preset.name }),
    );
  };

  const handleDelete = (preset: Preset) => {
    remove(preset);
    if (view.name !== 'picker') showView({ name: 'picker' });
    setPanelOpen(false);
  };

  const cloneFromPage = (draft: CustomCallDraft) => {
    try {
      sessionStorage.setItem(
        callDraftStorageKey(userId),
        JSON.stringify(draft),
      );
    } catch {
      /* Browser storage may be unavailable. */
    }
    router.push('/dashboard/clone?for=call');
  };

  const callPreset = findPreset(callPresetId);
  const endedPreset = ended ? findPreset(ended.presetId) : undefined;

  let screen: ReactNode;
  if (inCall && callPreset) {
    screen = <InCallView elapsed={formattedTime} preset={callPreset} />;
  } else if (ended && endedPreset) {
    screen = (
      <CallEndedView
        connecting={connecting}
        duration={ended.duration}
        onBack={() => setEnded(null)}
        onCallAgain={startCall}
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
        callVoices={callVoices}
        intent={view.intent}
        onCancel={() => showView({ name: 'picker' })}
        // Clone hands the draft back without a character ID, so editing an
        // existing character keeps to its saved voices.
        onCloneVoice={view.intent.kind === 'edit' ? undefined : cloneFromPage}
        onDelete={handleDelete}
        onSaved={handleSaved}
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
          highlightId={highlightId}
          isPaidUser={isPaidUser}
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
      data-testid="call-experience"
    >
      {screen}
      <CallPanel
        callVoices={callVoices}
        connecting={connecting}
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
        onStartCall={startCall}
        open={panelOpen && !inCall}
      />
    </div>
  );
}
