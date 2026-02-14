'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  useConnectionState,
  useLocalParticipant,
  useVoiceAssistant,
} from '@livekit/components-react';
import { ConnectionState } from 'livekit-client';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { SessionConfig } from '@/components/call/session-config';
import { Form } from '@/components/ui/form';
import { defaultSessionConfig } from '@/data/default-config';
import { ModelId } from '@/data/models';
import type { CallLanguage } from '@/data/playground-state';
import { callLanguages as callLanguageCodes } from '@/data/playground-state';
import { VoiceId } from '@/data/voices';
import { useConnection } from '@/hooks/use-connection';
import { usePlaygroundState } from '@/hooks/use-playground-state';
import { getTranslatedLanguages } from '@/lib/i18n/get-translated-languages';
import type { Locale } from '@/lib/i18n/i18n-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { InstructionsEditor } from './instructions-editor';
import { PresetSave } from './preset-save';
import { PresetSelector } from './preset-selector';

// import { useToast } from "@/hooks/use-toast";

// Configuration changes that require full reconnection instead of hot-reload
const RECONNECT_REQUIRED_FIELDS = ['voice', 'grok_image_enabled'];

export const ConfigurationFormSchema = z.object({
  model: z.enum(Object.values(ModelId)),
  voice: z.enum(Object.values(VoiceId)),
  temperature: z.number().min(0.6).max(1.2),
  maxOutputTokens: z.number().nullable(),
  grokImageEnabled: z.boolean(),
});

export interface ConfigurationFormFieldProps {
  form: UseFormReturn<z.infer<typeof ConfigurationFormSchema>>;
  schema?: typeof ConfigurationFormSchema;
}

interface ConfigurationFormProps {
  lang: Locale;
}

export function ConfigurationForm({ lang }: ConfigurationFormProps) {
  const { pgState, dispatch, helpers } = usePlaygroundState();
  const { connect, disconnect, dict } = useConnection();
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const form = useForm<z.infer<typeof ConfigurationFormSchema>>({
    resolver: zodResolver(ConfigurationFormSchema),
    defaultValues: { ...defaultSessionConfig },
    mode: 'onChange',
  });
  const formValues = form.watch();
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref to track timeout
  const hasConnectedOnceRef = useRef(false); // Track if we've connected once
  const isReconnectingRef = useRef(false); // Track if we're currently reconnecting to prevent loops
  // const { toast } = useToast();
  const { agent } = useVoiceAssistant();

  const searchParams = useSearchParams();

  const showInstruction =
    searchParams.get('showInstruction') === '' ||
    searchParams.get('showInstruction') === 'true';

  const translatedLanguages = useMemo(
    () =>
      getTranslatedLanguages(
        lang,
        callLanguageCodes.map(({ value }) => value),
      ),
    [lang],
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
      model: values.model,
      voice: values.voice,
      temperature: values.temperature,
      max_output_tokens: values.maxOutputTokens || '',
      grok_image_enabled: values.grokImageEnabled,
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

        toast.success(dict.reconnected);
      } catch {
        toast.error(dict.reconnectionFailed);
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
        toast(dict.configurationUpdated);
      }
    } catch {
      toast(dict.configurationUpdateError);
    }
  }, [
    pgState.sessionConfig,
    pgState.instructions,
    localParticipant,
    toast,
    agent?.identity,
    connect,
    disconnect,
    helpers,
    dict,
  ]);

  // Function to debounce updates when user stops interacting
  const handleDebouncedUpdate = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current); // Clear existing timeout
    }

    // Set a new timeout to perform the update after 500ms of inactivity
    debounceTimeoutRef.current = setTimeout(() => {
      updateConfig();
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
        type: 'SET_SESSION_CONFIG',
        payload: formValues,
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
    dispatch({ type: 'SET_LANGUAGE', payload: value as CallLanguage });
  };
  const displayLanguage = true;

  return (
    <header className="flex w-full flex-col items-stretch justify-stretch">
      <Form {...form}>
        <div className="w-full border-separator1 border-b px-4 pt-0 pb-4 md:px-1 md:py-4">
          <div className="font-bold text-fg0 text-xs uppercase tracking-widest">
            {dict.configurationTitle}
          </div>
        </div>

        {/* Language Selection */}
        {displayLanguage && (
          <div className="flex w-full items-center justify-between border-separator1 border-b px-4 py-4 md:px-1">
            <div className="font-semibold text-neutral-400 text-xs uppercase tracking-widest">
              {dict.languageLabel}
            </div>
            <Select
              disabled={connectionState === ConnectionState.Connected}
              onValueChange={handleLanguageChange}
              value={pgState.language}
            >
              <SelectTrigger className="h-9 w-fit text-neutral-200">
                <SelectValue placeholder={dict.languagePlaceholder} />
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

        {/* Character Selection */}
        <div className="w-full border-separator1 border-b px-4 py-6 md:px-1">
          <PresetSelector />
          {showInstruction && (
            <div className="mt-4 space-y-4">
              {/* Instructions Editor for custom per-character instructions */}
              <div className="rounded-lg border border-separator1 bg-muted/30 p-3">
                <div className="mb-2 font-semibold text-neutral-400 text-xs uppercase tracking-widest">
                  {helpers.getSelectedPreset(pgState)?.name || 'Character'}{' '}
                  Instructions
                </div>
                <InstructionsEditor instructions={pgState.instructions} />
              </div>
              <PresetSave />
            </div>
          )}
        </div>

        <SessionConfig form={form} />
      </Form>
    </header>
  );
}
