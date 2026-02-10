import { defaultSessionConfig } from '@/data/default-config';
import type { CallLanguage, PlaygroundState } from '@/data/playground-state';
import { getPresetInstructions } from '@/data/preset-instructions';
import {
  defaultPresets as baseDefaultPresets,
  type Preset,
} from '@/data/presets';
import type { SessionConfig } from '@/data/session-config';

export const createPlaygroundStateHelpers = (
  defaultPresets: Preset[] = baseDefaultPresets,
) => {
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
          if (selectedPreset.description) {
            params.set('presetDescription', selectedPreset.description);
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
        returnValue.preset = {
          id: presetId,
          name: params.get('presetName') || undefined,
          description: params.get('presetDescription') || undefined,
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
     * Checks if the immutable Grok Imagine prompt should be used
     * Returns true if Grok Imagine is enabled AND the current preset is NOT the creative-artist preset
     */
    shouldUseImmutablePrompt: (state: PlaygroundState): boolean => {
      const { sessionConfig, selectedPresetId } = state;
      return (
        sessionConfig.grokImageEnabled && selectedPresetId !== 'creative-artist'
      );
    },

    /**
     * Gets the full instructions with immutable prompt prepended if needed.
     * Prioritizes character overrides for the selected character if available.
     */
    getFullInstructions: (state: PlaygroundState): string => {
      // Use character overrides if available for the selected character
      let instructions = state.instructions;
      if (
        state.selectedPresetId &&
        state.characterOverrides[state.selectedPresetId]
      ) {
        instructions = state.characterOverrides[state.selectedPresetId];
      }

      return instructions;
    },

    /**
     * Returns a new state object with full instructions (including additional prompt if needed)
     * and resolves language-specific translations if available.
     */
    getStateWithFullInstructions: (state: PlaygroundState): PlaygroundState => {
      // Try to get translated instructions for the selected preset and language
      let instructions = state.instructions;

      if (state.selectedPresetId && state.language !== 'en') {
        const translatedInstructions = getPresetInstructions(
          state.selectedPresetId,
          state.language as CallLanguage,
        );
        if (translatedInstructions) {
          instructions = translatedInstructions;
        }
      }

      const fullInstructions = helpers.getFullInstructions({
        ...state,
        instructions,
      });

      return {
        ...state,
        instructions: fullInstructions,
      };
    },
  };

  return helpers;
};

export const playgroundStateHelpers = createPlaygroundStateHelpers();
