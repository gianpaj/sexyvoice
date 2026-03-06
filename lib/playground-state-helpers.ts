import { defaultSessionConfig } from '@/data/default-config';
import type { CallLanguage, PlaygroundState } from '@/data/playground-state';
import { getPresetInstructions } from '@/data/preset-instructions';
import type { Preset } from '@/data/presets';
import type { SessionConfig } from '@/data/session-config';

export const createPlaygroundStateHelpers = (defaultPresets: Preset[] = []) => {
  const helpers = {
    getSelectedPreset: (state: PlaygroundState) =>
      [...defaultPresets, ...state.customCharacters].find(
        (preset) => preset.id === state.selectedPresetId,
      ),
    getDefaultPresets: () => defaultPresets,
    getAllPresets: (state: PlaygroundState) => [
      ...defaultPresets,
      ...state.customCharacters,
    ],

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fine
    encodeToUrlParams: (state: PlaygroundState): string => {
      // Preserve existing search params from the current URL
      const existingParams =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams();
      const params = new URLSearchParams(existingParams);

      let isDefaultPreset = false;
      const selectedPreset = helpers.getSelectedPreset(state);
      if (selectedPreset) {
        params.set('preset', selectedPreset.id);
        isDefaultPreset = defaultPresets.some(
          (p) => p.id === selectedPreset.id,
        );
      }

      if (!isDefaultPreset) {
        if (state.instructions) {
          params.set('instructions', state.instructions);
        }

        if (selectedPreset) {
          params.set('presetName', selectedPreset.name);
          const presetDescription =
            selectedPreset.localizedDescriptions?.[state.language] ??
            selectedPreset.localizedDescriptions?.en;
          if (presetDescription) {
            params.set('presetDescription', presetDescription);
          }
        }

        if (state.sessionConfig) {
          for (const [key, value] of Object.entries(state.sessionConfig)) {
            if (value !== defaultSessionConfig[key as keyof SessionConfig]) {
              params.set(`sessionConfig.${key}`, String(value));
            }
          }
        }
      }

      return params.toString();
    },

    decodeFromURLParams: (
      urlParams: string,
    ): { state: Partial<PlaygroundState>; preset?: Partial<Preset> } => {
      const params = new URLSearchParams(urlParams);
      const returnValue: {
        state: Partial<PlaygroundState>;
        preset?: Partial<Preset>;
      } = { state: {} };

      const instructions = params.get('instructions');
      if (instructions) {
        returnValue.state.instructions = instructions;
      }

      const sessionConfig: Partial<PlaygroundState['sessionConfig']> = {};
      params.forEach((value, key) => {
        if (key.startsWith('sessionConfig.')) {
          const configKey = key.split(
            '.',
          )[1] as keyof PlaygroundState['sessionConfig'];
          sessionConfig[configKey] = value as any;
        }
      });

      if (Object.keys(sessionConfig).length > 0) {
        returnValue.state.sessionConfig = sessionConfig as SessionConfig;
      }

      const presetId = params.get('preset');
      if (presetId) {
        const presetDescription = params.get('presetDescription') || undefined;
        returnValue.preset = {
          id: presetId,
          name: params.get('presetName') || undefined,
          localizedDescriptions: presetDescription
            ? { en: presetDescription }
            : undefined,
        };
        returnValue.state.selectedPresetId = presetId;
      }

      return returnValue;
    },

    updateBrowserUrl: (state: PlaygroundState) => {
      if (typeof window !== 'undefined') {
        const params = helpers.encodeToUrlParams(state);
        const newUrl = `${window.location.origin}${window.location.pathname}${params ? `?${params}` : ''}`;
        window.history.replaceState({}, '', newUrl);
      }
    },

    /**
     * Gets the full instructions for the current state.
     * Prioritizes per-language character overrides for the selected character.
     */
    getFullInstructions: (state: PlaygroundState): string => {
      // Use per-language character overrides if available for the selected character
      let instructions = state.instructions;
      if (state.selectedPresetId) {
        const langOverride =
          state.characterOverrides[state.selectedPresetId]?.[state.language];
        if (langOverride) {
          instructions = langOverride;
        }
      }

      return instructions;
    },

    /**
     * Returns a new state object with full instructions,
     * resolving language-specific translations if available.
     *
     * Priority for instruction resolution:
     * 1. Per-language character override
     * 2. Custom character localizedInstructions for the language
     * 3. Built-in preset translations (from preset-instructions index)
     * 4. Preset's default instructions field (English / fallback)
     */
    getStateWithFullInstructions: (state: PlaygroundState): PlaygroundState => {
      if (!state.selectedPresetId) {
        return state;
      }

      // Resolve the selected preset so we can sync sessionConfig
      const allPresets = [...defaultPresets, ...state.customCharacters];
      const preset = allPresets.find((p) => p.id === state.selectedPresetId);

      // Sync sessionConfig from the selected preset so the correct voice
      // (and other settings) are sent to the call-token API.
      // Voice changes on custom characters only update the preset inside
      // customCharacters, not the top-level sessionConfig.
      const baseState = preset
        ? { ...state, sessionConfig: preset.sessionConfig }
        : state;

      // 1. Per-language character override takes highest priority
      const langOverride =
        baseState.characterOverrides[baseState.selectedPresetId!]?.[
          baseState.language
        ];
      if (langOverride !== undefined) {
        return { ...baseState, instructions: langOverride };
      }

      // 2. Custom character localizedInstructions
      if (preset?.localizedInstructions?.[baseState.language] !== undefined) {
        return {
          ...baseState,
          instructions: preset.localizedInstructions[
            baseState.language
          ] as string,
        };
      }

      // 3. Built-in preset translations
      if (baseState.language !== 'en') {
        const translatedInstructions = getPresetInstructions(
          baseState.selectedPresetId!,
          baseState.language as CallLanguage,
        );
        if (translatedInstructions) {
          return { ...baseState, instructions: translatedInstructions };
        }
      }

      // 4. Fallback to preset's default instructions
      if (preset) {
        return { ...baseState, instructions: preset.instructions };
      }

      return baseState;
    },
  };

  return helpers;
};

export const playgroundStateHelpers = createPlaygroundStateHelpers();
