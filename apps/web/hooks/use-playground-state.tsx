'use client';

import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';

import { callScenes } from '@/data/call-scenes';
import { defaultSessionConfig } from '@/data/default-config';
import {
  type CallLanguage,
  defaultPlaygroundState,
  languageInitialInstructions,
  type PlaygroundState,
} from '@/data/playground-state';
import type { Preset } from '@/data/presets';
import { getPresetInstructions } from '@/lib/characters';
import { createPlaygroundStateHelpers } from '@/lib/playground-state-helpers';

function resolveInstructions(
  characterId: string,
  language: CallLanguage,
  allPresets: Preset[],
): string {
  return getPresetInstructions(
    allPresets.find((p) => p.id === characterId),
    language,
  );
}

// Define action types and payloads
type Action =
  | { type: 'SET_SCENE_INSTRUCTIONS'; payload: string }
  | { type: 'SET_SELECTED_PRESET_ID'; payload: string | null }
  | { type: 'SET_SELECTED_SCENE_ID'; payload: string | null }
  | { type: 'SET_MEMORY'; payload: boolean }
  | { type: 'SAVE_CUSTOM_CHARACTER'; payload: Preset }
  | { type: 'DELETE_CUSTOM_CHARACTER'; payload: string }
  | {
      type: 'RESTORE_CUSTOM_CHARACTER';
      payload: { index: number; preset: Preset };
    }
  | { type: 'SET_LANGUAGE'; payload: CallLanguage };

// Create the reducer function
function playgroundStateReducer(
  state: PlaygroundState,
  action: Action,
): PlaygroundState {
  switch (action.type) {
    case 'SET_SCENE_INSTRUCTIONS':
      return {
        ...state,
        sceneInstructions: action.payload,
      };
    case 'SET_SELECTED_PRESET_ID': {
      const newState = {
        ...state,
        selectedPresetId: action.payload,
      };

      const helpers = createPlaygroundStateHelpers(state.defaultPresets);
      const selectedPreset = helpers.getSelectedPreset(newState);

      if (action.payload) {
        // Resolve instructions for the selected character in the current language
        const allPresets = [...state.defaultPresets, ...state.customCharacters];
        newState.instructions = resolveInstructions(
          action.payload,
          state.language,
          allPresets,
        );
      } else {
        newState.instructions = selectedPreset?.instructions || '';
      }

      newState.sessionConfig =
        selectedPreset?.sessionConfig || defaultSessionConfig;
      return newState;
    }
    case 'SET_SELECTED_SCENE_ID': {
      const selectedScene = callScenes.find(
        (scene) => scene.id === action.payload,
      );
      const currentScene = callScenes.find(
        (scene) => scene.id === state.selectedSceneId,
      );
      const isTextModified =
        state.sceneInstructions !== (currentScene?.text ?? '');

      return {
        ...state,
        sceneInstructions: isTextModified
          ? state.sceneInstructions
          : (selectedScene?.text ?? ''),
        selectedSceneId: action.payload,
      };
    }
    case 'SET_MEMORY':
      return {
        ...state,
        memory: action.payload,
      };
    case 'SAVE_CUSTOM_CHARACTER': {
      const updatedPreset = action.payload;

      const updatedCharacters = state.customCharacters.map((character) =>
        character.id === updatedPreset.id ? updatedPreset : character,
      );
      if (
        !updatedCharacters.some(
          (character) => character.id === updatedPreset.id,
        )
      ) {
        updatedCharacters.push(updatedPreset);
      }
      return {
        ...state,
        customCharacters: updatedCharacters,
      };
    }
    case 'DELETE_CUSTOM_CHARACTER': {
      const updatedCharacters = state.customCharacters.filter(
        (character: Preset) => character.id !== action.payload,
      );
      return {
        ...state,
        customCharacters: updatedCharacters,
      };
    }
    case 'RESTORE_CUSTOM_CHARACTER': {
      const { index, preset } = action.payload;
      if (state.customCharacters.some((c) => c.id === preset.id)) return state;
      const customCharacters = [...state.customCharacters];
      customCharacters.splice(
        Math.min(index, customCharacters.length),
        0,
        preset,
      );
      return { ...state, customCharacters };
    }
    case 'SET_LANGUAGE': {
      const newLanguage = action.payload;
      const allPresets = [...state.defaultPresets, ...state.customCharacters];

      // Resolve instructions for the selected character in the new language
      let newInstructions = state.instructions;

      if (state.selectedPresetId) {
        newInstructions = resolveInstructions(
          state.selectedPresetId,
          newLanguage,
          allPresets,
        );
      }

      return {
        ...state,
        initialInstruction:
          languageInitialInstructions[newLanguage] ||
          languageInitialInstructions.en,
        instructions: newInstructions,
        language: newLanguage,
      };
    }
    default:
      return state;
  }
}

// Update the context type
interface PlaygroundStateContextProps {
  dispatch: Dispatch<Action>;
  helpers: ReturnType<typeof createPlaygroundStateHelpers>;
  pgState: PlaygroundState;
  /** Selects a character and keeps the URL in sync so a refresh restores it. */
  selectPreset: (presetId: string | null) => void;
}

// Create the context
const PlaygroundStateContext = createContext<
  PlaygroundStateContextProps | undefined
>(undefined);

// Create a custom hook to use the global state
export const usePlaygroundState = (): PlaygroundStateContextProps => {
  const context = useContext(PlaygroundStateContext);
  if (!context) {
    throw new Error(
      'usePlaygroundState must be used within a PlaygroundStateProvider',
    );
  }
  return context;
};

// Create the provider component
interface PlaygroundStateProviderProps {
  children: ReactNode;
  defaultPresets?: Preset[];
  initialCustomCharacters?: Preset[];
  initialState?: Partial<PlaygroundState>;
}

const EMPTY_PRESETS: Preset[] = [];

export const PlaygroundStateProvider = ({
  children,
  defaultPresets = EMPTY_PRESETS,
  initialCustomCharacters = EMPTY_PRESETS,
  initialState,
}: PlaygroundStateProviderProps) => {
  const helpers = useMemo(
    () => createPlaygroundStateHelpers(defaultPresets),
    [defaultPresets],
  );
  const mergedInitialState: PlaygroundState = {
    ...defaultPlaygroundState,
    customCharacters: initialCustomCharacters,
    defaultPresets,
    ...initialState,
    sessionConfig: {
      ...defaultPlaygroundState.sessionConfig,
      ...(initialState?.sessionConfig ?? {}),
    },
  };

  const [state, dispatch] = useReducer(
    playgroundStateReducer,
    mergedInitialState,
  );

  // Re-selecting reloads the prompt and session config from the stored
  // preset, which picks up a character that was just saved.
  const selectPreset = (presetId: string | null) => {
    dispatch({ payload: presetId, type: 'SET_SELECTED_PRESET_ID' });
    helpers.updateBrowserUrl(presetId);
  };

  // Mount only. The URL is read once and rewritten to match; re-running this
  // against a later render's props would drop a character created in this
  // session and reset unsaved instructions.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reads the URL once on mount
  useEffect(() => {
    if (!window.location.search) return;

    const presetId = helpers.getPresetIdFromUrlParams(window.location.search);
    const loadedPreset = [
      ...helpers.getDefaultPresets(),
      ...initialCustomCharacters,
    ].find((preset) => preset.id === presetId);

    if (loadedPreset) {
      dispatch({ payload: loadedPreset.id, type: 'SET_SELECTED_PRESET_ID' });
    }
    // Old links carry prompts in the query string. An ID this page did not
    // load belongs to another user or a deleted character, and call-token
    // rejects both, so the link is dropped. On a full page load this runs
    // before Next patches `replaceState`, so the current state is kept.
    helpers.updateBrowserUrl(loadedPreset?.id ?? null, window.history.state);
  }, []);

  return (
    <PlaygroundStateContext.Provider
      value={{
        dispatch,
        helpers,
        pgState: state,
        selectPreset,
      }}
    >
      {children}
    </PlaygroundStateContext.Provider>
  );
};
