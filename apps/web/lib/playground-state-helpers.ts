import type { PlaygroundState } from '@/data/playground-state';
import type { Preset } from '@/data/presets';
import type { SessionConfig } from '@/data/session-config';

const PRESET_PARAM = 'preset';

/**
 * Query params the call page owns. `preset` is the one it still writes; the
 * rest are from links that used to carry the prompt and session settings.
 * Everything else in the URL belongs to someone else and is left alone.
 */
const isOwnedUrlParam = (key: string) =>
  key === PRESET_PARAM ||
  key === 'instructions' ||
  key === 'presetName' ||
  key === 'presetDescription' ||
  key.startsWith('sessionConfig.');

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
      new URLSearchParams(urlParams).get(PRESET_PARAM),
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

    // The URL carries only the preset ID. Prompts and session settings load
    // from the database and stay out of browser history and analytics, so old
    // links that still carry them are stripped on every write.
    //
    // `state` defaults to `null`, Next's documented shallow-update pattern: its
    // patched `replaceState` copies the router tree into the new entry and
    // syncs the router's URL. A state carrying Next's `__NA` flag skips that
    // sync, so a later router refresh would restore the old URL. Callers that
    // run before Next installs its patch pass `window.history.state` instead,
    // so the tree survives and Back doesn't reload the page.
    updateBrowserUrl: (presetId: string | null, state: unknown = null) => {
      const params = new URLSearchParams(window.location.search);
      for (const key of [...params.keys()]) {
        if (isOwnedUrlParam(key)) {
          params.delete(key);
        }
      }
      if (presetId) {
        params.set(PRESET_PARAM, presetId);
      }
      const search = params.toString();

      window.history.replaceState(
        state,
        '',
        `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
      );
    },
  };

  return helpers;
};
