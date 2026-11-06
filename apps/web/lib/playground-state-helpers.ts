import type { PlaygroundState } from '@/data/playground-state';
import type { Character } from '@/lib/calls/characters';

const PRESET_PARAM = 'preset';

/**
 * Query params the call page owns. `preset` is the one it still writes;
 * `custom` and `voice` come back from the Clone page; the rest are from links
 * that used to carry the prompt and session settings. Everything else in the
 * URL belongs to someone else and is left alone.
 */
const isOwnedUrlParam = (key: string) =>
  key === PRESET_PARAM ||
  key === 'custom' ||
  key === 'voice' ||
  key === 'instructions' ||
  key === 'presetName' ||
  key === 'presetDescription' ||
  key.startsWith('sessionConfig.');

export const createPlaygroundStateHelpers = (
  defaultPresets: Character[] = [],
) => {
  const helpers = {
    getAllPresets: (state: PlaygroundState) => [
      ...defaultPresets,
      ...state.customCharacters,
    ],
    getDefaultPresets: () => defaultPresets,

    getPresetIdFromUrlParams: (urlParams: string): string | null =>
      new URLSearchParams(urlParams).get(PRESET_PARAM),
    getSelectedPreset: (state: PlaygroundState) =>
      [...defaultPresets, ...state.customCharacters].find(
        (preset) => preset.id === state.selectedPresetId,
      ),

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
