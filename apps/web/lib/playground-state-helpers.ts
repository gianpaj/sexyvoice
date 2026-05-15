import { defaultSessionConfig } from '@/data/default-config';
import type { PlaygroundState } from '@/data/playground-state';
import type { Preset } from '@/data/presets';
import type { SessionConfig } from '@/data/session-config';

export interface CallTokenPlaygroundState {
  instructions: string;
  language: PlaygroundState['language'];
  selectedPresetId: PlaygroundState['selectedPresetId'];
  sessionConfig: Pick<
    SessionConfig,
    'maxOutputTokens' | 'model' | 'temperature' | 'voice'
  >;
}

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
        typeof window === 'undefined'
          ? new URLSearchParams()
          : new URLSearchParams(window.location.search);
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
          switch (configKey) {
            case 'maxOutputTokens':
              sessionConfig.maxOutputTokens =
                value === 'null' ? null : Number(value);
              break;
            case 'model':
              sessionConfig.model = value as SessionConfig['model'];
              break;
            case 'temperature':
              sessionConfig.temperature = Number(value);
              break;
            case 'voice':
              sessionConfig.voice = value;
              break;
            default:
              break;
          }
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
     */
    getFullInstructions: (state: PlaygroundState): string => {
      return state.instructions;
    },

    /**
     * Returns a new state object with full instructions,
     * resolving language-specific translations if available.
     *
     * Priority for instruction resolution:
     * 1. Character localizedInstructions for the language
     * 2. Preset's default instructions field (fallback)
     */
    getStateWithFullInstructions: (
      state: PlaygroundState,
    ): CallTokenPlaygroundState => {
      const allPresets = [...defaultPresets, ...state.customCharacters];
      const preset = allPresets.find((p) => p.id === state.selectedPresetId);
      let instructions = state.instructions;

      // 1. Character localizedInstructions
      if (preset?.localizedInstructions?.[state.language] !== undefined) {
        instructions = preset.localizedInstructions[state.language] as string;
      } else if (preset) {
        // 2. Fallback to preset's default instructions
        instructions = preset.instructions;
      }

      return {
        instructions,
        language: state.language,
        selectedPresetId: state.selectedPresetId,
        sessionConfig: {
          maxOutputTokens: state.sessionConfig.maxOutputTokens,
          model: state.sessionConfig.model,
          temperature: state.sessionConfig.temperature,
          voice: state.sessionConfig.voice,
        },
      };
    },
  };

  return helpers;
};

export const playgroundStateHelpers = createPlaygroundStateHelpers();
