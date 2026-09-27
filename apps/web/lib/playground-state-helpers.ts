import type { PlaygroundState } from '@/data/playground-state';
import type { Preset } from '@/data/presets';
import type { SessionConfig } from '@/data/session-config';

export interface CallTokenPlaygroundState {
  instructions: string;
  language: PlaygroundState['language'];
  memory: PlaygroundState['memory'];
  sceneInstructions: string | null;
  selectedPresetId: PlaygroundState['selectedPresetId'];
  selectedSceneId: PlaygroundState['selectedSceneId'];
  sessionConfig: Pick<
    SessionConfig,
    'maxOutputTokens' | 'model' | 'temperature' | 'voice'
  >;
}

export const createPlaygroundStateHelpers = (defaultPresets: Preset[] = []) => {
  const helpers = {
    // The URL carries only the preset ID. Prompts and session settings load
    // from the database and stay out of browser history and analytics.
    encodeToUrlParams: (state: PlaygroundState): string =>
      state.selectedPresetId
        ? new URLSearchParams({ preset: state.selectedPresetId }).toString()
        : '',
    getAllPresets: (state: PlaygroundState) => [
      ...defaultPresets,
      ...state.customCharacters,
    ],
    getDefaultPresets: () => defaultPresets,

    /**
     * Gets the full instructions for the current state.
     */
    getFullInstructions: (state: PlaygroundState): string => {
      const sceneInstructions = state.sceneInstructions.trim();
      if (!sceneInstructions) {
        return state.instructions;
      }

      return `${state.instructions.trim()}\n\nScene instructions:\n${sceneInstructions}`.trim();
    },
    getPresetIdFromUrlParams: (urlParams: string): string | null =>
      new URLSearchParams(urlParams).get('preset'),
    getSelectedPreset: (state: PlaygroundState) =>
      [...defaultPresets, ...state.customCharacters].find(
        (preset) => preset.id === state.selectedPresetId,
      ),

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
        memory: state.memory,
        sceneInstructions: state.sceneInstructions.trim() || null,
        selectedPresetId: state.selectedPresetId,
        selectedSceneId: state.selectedSceneId,
        sessionConfig: {
          maxOutputTokens: state.sessionConfig.maxOutputTokens,
          model: state.sessionConfig.model,
          temperature: state.sessionConfig.temperature,
          voice: state.sessionConfig.voice,
        },
      };
    },

    updateBrowserUrl: (state: PlaygroundState) => {
      if (typeof window !== 'undefined') {
        const params = helpers.encodeToUrlParams(state);
        const newUrl = `${window.location.origin}${window.location.pathname}${params ? `?${params}` : ''}`;
        window.history.replaceState({}, '', newUrl);
      }
    },
  };

  return helpers;
};
