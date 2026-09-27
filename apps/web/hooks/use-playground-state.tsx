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
import { createPlaygroundStateHelpers } from '@/lib/playground-state-helpers';

const LS_SELECTED_PRESET_ID_KEY = 'PG_SELECTED_PRESET_ID';

const storageHelper = {
  getStoredSelectedPresetId: (): string =>
    localStorage.getItem(LS_SELECTED_PRESET_ID_KEY) || '',
  setStoredSelectedPresetId: (presetId: string | null): void => {
    if (presetId === null) {
      localStorage.removeItem(LS_SELECTED_PRESET_ID_KEY);
    } else {
      localStorage.setItem(LS_SELECTED_PRESET_ID_KEY, presetId);
    }
  },
};

/**
 * Resolves the best instructions for a given character and language.
 *
 * Priority:
 * 1. Character localizedInstructions for the specific language
 * 2. Preset's default instructions field (fallback)
 */
function resolveInstructions(
  characterId: string,
  language: CallLanguage,
  allPresets: Preset[],
): string {
  // Find the preset
  const preset = allPresets.find((p) => p.id === characterId);

  // 1. Custom character localizedInstructions
  if (preset?.localizedInstructions?.[language] !== undefined) {
    return preset.localizedInstructions[language] as string;
  }

  // 3. Fallback to preset's default instructions
  return preset?.instructions || '';
}

// Define action types and payloads
type Action =
  | {
      type: 'SET_SESSION_CONFIG';
      payload: Partial<PlaygroundState['sessionConfig']>;
    }
  | { type: 'SET_INSTRUCTIONS'; payload: string }
  | { type: 'SET_SCENE_INSTRUCTIONS'; payload: string }
  | { type: 'SET_SELECTED_PRESET_ID'; payload: string | null }
  | { type: 'SET_SELECTED_SCENE_ID'; payload: string | null }
  | { type: 'SET_MEMORY'; payload: boolean }
  | { type: 'SAVE_CUSTOM_CHARACTER'; payload: Preset }
  | { type: 'DELETE_CUSTOM_CHARACTER'; payload: string }
  | { type: 'SET_LANGUAGE'; payload: CallLanguage };

// Create the reducer function
function playgroundStateReducer(
  state: PlaygroundState,
  action: Action,
): PlaygroundState {
  switch (action.type) {
    case 'SET_SESSION_CONFIG':
      return {
        ...state,
        sessionConfig: {
          ...state.sessionConfig,
          ...action.payload,
        },
      };
    case 'SET_INSTRUCTIONS':
      return {
        ...state,
        instructions: action.payload,
      };
    case 'SET_SCENE_INSTRUCTIONS':
      return {
        ...state,
        sceneInstructions: action.payload,
      };
    case 'SET_SELECTED_PRESET_ID': {
      storageHelper.setStoredSelectedPresetId(action.payload);

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
      const language = state.language;
      const existingCharacter = state.customCharacters.find(
        (c) => c.id === action.payload.id,
      );

      // Build updated localizedInstructions
      const existingLocalized =
        existingCharacter?.localizedInstructions ||
        action.payload.localizedInstructions ||
        {};
      const updatedLocalized: Partial<Record<string, string>> = {
        ...existingLocalized,
        [language]: action.payload.instructions,
      };

      // If saving in English, also update the default instructions field
      const updatedPreset: Preset = {
        ...action.payload,
        instructions:
          language === 'en'
            ? action.payload.instructions
            : existingCharacter?.instructions || action.payload.instructions,
        localizedInstructions: updatedLocalized,
      };

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

  const selectPreset = (presetId: string | null) => {
    dispatch({ payload: presetId, type: 'SET_SELECTED_PRESET_ID' });
    helpers.updateBrowserUrl(presetId);
  };

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
    // rejects both, so the link is dropped.
    helpers.updateBrowserUrl(loadedPreset?.id ?? null);
  }, [helpers, initialCustomCharacters]);

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
