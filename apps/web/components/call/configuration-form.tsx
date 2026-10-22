'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  useConnectionState,
  useLocalParticipant,
  useVoiceAssistant,
} from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { SessionConfig } from '@/components/call/session-config';
import { Form } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { defaultSessionConfig } from '@/data/default-config';
import { ModelId } from '@/data/models';
import type { CallLanguage } from '@/data/playground-state';
import {
  callLanguages as callLanguageCodes,
  emptyCustomCallDraft,
} from '@/data/playground-state';
import type { DBVoice } from '@/data/voices';
import { useConnection } from '@/hooks/use-connection';
import { usePlaygroundState } from '@/hooks/use-playground-state';
import { callDraftStorageKey, customCallDraftSchema } from '@/lib/call-draft';
import type { SavedCallVoice } from '@/lib/call-voices';
import { getTranslatedLanguages } from '@/lib/i18n/get-translated-languages';
import type { Locale } from '@/lib/i18n/i18n-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { ConfigurationFormSchema } from './configuration-form.schema';
import { CustomCharacterForm } from './custom-character-form';
import { InstructionsEditor } from './instructions-editor';
import { PresetSave } from './preset-save';
import { PresetSelector } from './preset-selector';
import { SceneSelector } from './scene-selector';

// import { useToast } from "@/hooks/use-toast";

// Configuration changes that require full reconnection instead of hot-reload
const RECONNECT_REQUIRED_FIELDS = ['voice', 'model'];

interface ConfigurationFormProps {
  callVoices?: DBVoice[];
  isPaidUser?: boolean;
  lang: Locale;
  savedVoices?: SavedCallVoice[];
  userId?: string;
}

const EMPTY_ITEMS: DBVoice[] = [];

export function ConfigurationForm({
  lang,
  savedVoices = [],
  userId = '',
  isPaidUser = false,
  callVoices = EMPTY_ITEMS,
}: ConfigurationFormProps) {
  const { pgState, dispatch, helpers } = usePlaygroundState();
  const { connect, disconnect } = useConnection();
  const t = useTranslations('call');
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const form = useForm<z.infer<typeof ConfigurationFormSchema>>({
    defaultValues: { ...defaultSessionConfig },
    mode: 'onChange',
    resolver: zodResolver(ConfigurationFormSchema),
  });
  // eslint-disable-next-line react-compiler/react-memo-exhaustive-deps
  const formValues = form.watch();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref to track timeout
  const restoredDraftRef = useRef(false);
  const hasConnectedOnceRef = useRef(false); // Track if we've connected once
  const isReconnectingRef = useRef(false); // Track if we're currently reconnecting to prevent loops
  // const { toast } = useToast();
  const { agent } = useVoiceAssistant();

  const translatedLanguages = getTranslatedLanguages(
    lang,
    callLanguageCodes.map(({ value }) => value),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: fine
  const updateConfig = useCallback(async () => {
    // Don't update if we're currently reconnecting to prevent loops
    if (isReconnectingRef.current) {
      console.log('Skipping config update - reconnection in progress');
      return;
    }

    const values = pgState.sessionConfig;
    const fullInstructions = helpers.getFullInstructions(pgState);
    const attributes: { [key: string]: string | number | boolean } = {
      instructions: fullInstructions,
      max_output_tokens: values.maxOutputTokens || '',
      model: values.model,
      temperature: values.temperature,
      voice: values.voice,
    };
    if (!agent?.identity) {
      return;
    }

    // Skip the very first update right after connection
    // (config was already sent via token)
    if (!hasConnectedOnceRef.current) {
      hasConnectedOnceRef.current = true;
      return;
    }

    // Check if any attributes have changed
    // Convert both to strings for comparison since attributes are stored as strings
    const hasChanges = Object.keys(attributes).some(
      (key) =>
        String(attributes[key]) !== String(localParticipant.attributes[key]),
    );

    if (!hasChanges) {
      // console.debug('no changes');
      return;
    }

    // Check if any critical fields changed that require full reconnection
    const hasCriticalChanges = RECONNECT_REQUIRED_FIELDS.some(
      (key) =>
        String(attributes[key]) !== String(localParticipant.attributes[key]),
    );

    //const listOfThingsThatChanged = Object.keys(attributes).filter(key => String(attributes[key]) !== String(localParticipant.attributes[key]));
    //console.log("listOfThingsThatChanged: ", listOfThingsThatChanged);

    if (hasCriticalChanges) {
      console.debug(
        'Critical config change detected, triggering reconnection...',
      );

      // Set reconnecting flag to prevent update loops
      isReconnectingRef.current = true;

      try {
        // Trigger full reconnection
        await disconnect();
        // Small delay to ensure clean disconnect
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Reset the connection flag so the first update after reconnect is skipped
        hasConnectedOnceRef.current = false;

        await connect();

        // Wait a bit longer for the connection to stabilize and attributes to sync
        await new Promise((resolve) => setTimeout(resolve, 500));

        toast.success(t('reconnected'));
      } catch {
        toast.error(t('reconnectionFailed'));
      } finally {
        // Always reset the reconnecting flag
        isReconnectingRef.current = false;
      }
      return;
    }

    console.debug('has changes, sending RPC');

    try {
      const response = await localParticipant.performRpc({
        destinationIdentity: agent.identity,
        method: 'pg.updateConfig',
        payload: JSON.stringify(attributes),
      });
      console.debug('pg.updateConfig', response);
      const responseObj = JSON.parse(response);
      if (responseObj.changed) {
        toast(t('configurationUpdated'));
      }
    } catch {
      toast(t('configurationUpdateError'));
    }
  }, [
    pgState.sessionConfig,
    pgState.instructions,
    pgState.sceneInstructions,
    localParticipant,
    toast,
    agent?.identity,
    connect,
    disconnect,
    helpers,
    t,
  ]);

  // Function to debounce updates when user stops interacting
  const handleDebouncedUpdate = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current); // Clear existing timeout
    }

    // Set a new timeout to perform the update after 500ms of inactivity
    debounceTimeoutRef.current = setTimeout(() => {
      updateConfig().catch(() => undefined);
    }, 500); // Adjust delay as needed
  }, [updateConfig]);

  // Reset connection flag when disconnected
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) {
      hasConnectedOnceRef.current = false;
      // Don't reset isReconnectingRef here - it's managed by the reconnection flow
    }
  }, [connectionState]);

  // Propagate form updates from the user
  useEffect(() => {
    if (form.formState.isValid && form.formState.isDirty) {
      dispatch({
        payload: formValues,
        type: 'SET_SESSION_CONFIG',
      });
    }
  }, [formValues, dispatch, form]);

  // Reset form when preset changes
  useEffect(() => {
    form.reset(pgState.sessionConfig);
  }, [pgState.sessionConfig, form]);

  // Push config updates to LiveKit agent when user stops interacting with the form
  useEffect(() => {
    if (form.formState.isValid) {
      handleDebouncedUpdate();
    }
  }, [form.formState.isValid, handleDebouncedUpdate]);

  // Debug: log the current form values whenever they change
  // useEffect(() => {
  //   console.log('Form Values:', formValues);
  // }, [formValues]);

  // const onSubmit = async (values: z.infer<typeof ConfigurationFormSchema>) => {
  //   console.log("submitted", values);
  // };

  const handleLanguageChange = (value: string) => {
    dispatch({ payload: value as CallLanguage, type: 'SET_LANGUAGE' });
  };
  const displayLanguage = true;
  const mode = pgState.mode ?? 'characters';
  const busy = connectionState !== ConnectionState.Disconnected;
  const changeMode = (value: string) => {
    if (busy || (value !== 'characters' && value !== 'custom')) return;
    dispatch({ type: 'SET_CALL_MODE', payload: value });
    helpers.updateBrowserUrl(
      value === 'custom'
        ? null
        : (pgState.characterPresetId ??
            helpers.getDefaultPresets()[0]?.id ??
            null),
    );
  };

  // Restore only on a return from Clone, scoped to the signed-in user.
  // biome-ignore lint/correctness/useExhaustiveDependencies: initial navigation only
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('custom') !== '1' || restoredDraftRef.current) return;
    restoredDraftRef.current = true;
    let draft = emptyCustomCallDraft;
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
    const voice = savedVoices.find((v) => v.id === params.get('voice'));
    dispatch({
      type: 'SET_CUSTOM_DRAFT',
      payload: {
        ...draft,
        ...(voice
          ? {
              sessionConfig: {
                ...draft.sessionConfig,
                model: ModelId.MISTRAL_TTS,
                audioReferenceId: voice.id,
                voice: voice.name,
              },
            }
          : {}),
      },
    });
    dispatch({ type: 'SET_CALL_MODE', payload: 'custom' });
  }, []);

  return (
    <header
      className="flex w-full flex-col items-stretch justify-stretch"
      data-testid="call-configuration-form"
    >
      <Form {...form}>
        <div className="w-full border-separator1 border-b px-4 pt-0 pb-4 md:px-1 md:py-4">
          <div className="font-bold text-fg0 text-xs uppercase tracking-widest">
            {t('configurationTitle')}
          </div>
        </div>

        {/* Language Selection */}
        {displayLanguage && (
          <div className="flex w-full items-center justify-between border-separator1 border-b px-4 py-4 md:px-1">
            <div className="font-semibold text-neutral-400 text-xs uppercase tracking-widest">
              {t('languageLabel')}
            </div>
            <Select
              disabled={connectionState === ConnectionState.Connected}
              onValueChange={handleLanguageChange}
              value={pgState.language}
            >
              <SelectTrigger className="h-9 w-fit text-neutral-200">
                <SelectValue placeholder={t('languagePlaceholder')} />
              </SelectTrigger>
              <SelectContent className="max-h-72 overflow-y-auto text-neutral-100">
                {translatedLanguages.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Memory opt-in (paid users only) */}
        {/*<Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <div className="flex w-full items-center justify-between gap-4 border-separator1 border-b px-4 py-4 md:px-1">
              <label className="flex flex-col gap-1" htmlFor="memory-toggle">
                <span className="font-semibold text-neutral-400 text-xs uppercase tracking-widest">
                  {t('memoryLabel')}
                </span>
                <span className="text-neutral-300 text-xs normal-case">
                  {t('memoryDescription')}
                </span>
              </label>
              <Switch
                checked={isPaidUser && pgState.memory}
                disabled={
                  !isPaidUser || connectionState === ConnectionState.Connected
                }
                id="memory-toggle"
                onCheckedChange={(checked) =>
                  dispatch({ type: 'SET_MEMORY', payload: checked })
                }
              />
            </div>
          </TooltipTrigger>
          {!isPaidUser && (
            <TooltipContent className="TooltipContent">
              <p>{t('memoryUpgradeTooltip')}</p>
            </TooltipContent>
          )}
        </Tooltip>*/}

        {/* Character Selection */}
        <div className="w-full border-separator1 border-b px-4 py-6 md:px-1">
          <Tabs onValueChange={changeMode} value={mode}>
            <TabsList
              aria-label={t('custom.modeLabel')}
              className="mb-5 grid h-11 w-full grid-cols-2"
            >
              <TabsTrigger
                className="data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-700 dark:data-[state=active]:bg-violet-500/15 dark:data-[state=active]:text-violet-200"
                disabled={busy}
                value="characters"
              >
                {t('custom.characters')}
              </TabsTrigger>
              <TabsTrigger
                className="data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-700 dark:data-[state=active]:bg-violet-500/15 dark:data-[state=active]:text-violet-200"
                disabled={busy}
                value="custom"
              >
                {t('custom.custom')}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="characters">
              <PresetSelector
                callVoices={callVoices}
                isPaidUser={isPaidUser}
                onCreateCharacter={() => changeMode('custom')}
              />
              {isPaidUser &&
                pgState.selectedPresetId &&
                !helpers
                  .getDefaultPresets()
                  .some((p) => p.id === pgState.selectedPresetId) && (
                  <div className="mt-4 space-y-4">
                    {/* Instructions Editor for custom per-character instructions */}
                    <div className="rounded-lg border border-separator1 bg-muted/30 p-3">
                      <div className="mb-2 font-semibold text-neutral-400 text-xs uppercase tracking-widest">
                        {t('characterInstructions').replace(
                          '__NAME__',
                          helpers.getSelectedPreset(pgState)?.name ||
                            t('characterFallbackName'),
                        )}
                      </div>
                      <InstructionsEditor instructions={pgState.instructions} />
                    </div>
                    <PresetSave />
                  </div>
                )}
            </TabsContent>
            <TabsContent value="custom">
              <CustomCharacterForm
                callVoices={callVoices}
                disabled={busy}
                isPaidUser={isPaidUser}
                savedVoices={savedVoices}
                userId={userId}
              />
            </TabsContent>
          </Tabs>
        </div>

        <SceneSelector isPaidUser={isPaidUser} />

        <SessionConfig form={form} />
      </Form>
    </header>
  );
}
