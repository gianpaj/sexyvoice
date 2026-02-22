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

import { defaultSessionConfig } from '@/data/default-config';
import {
  type CallLanguage,
  defaultPlaygroundState,
  languageInitialInstructions,
  type PlaygroundState,
} from '@/data/playground-state';
import { getPresetInstructions } from '@/data/preset-instructions';
import type { Preset } from '@/data/presets';
import { createPlaygroundStateHelpers } from '@/lib/playground-state-helpers';

const LS_SELECTED_PRESET_ID_KEY = 'PG_SELECTED_PRESET_ID';

const storageHelper = {
  getStoredSelectedPresetId: (): string =>
    localStorage.getItem(LS_SELECTED_PRESET_ID_KEY) || '',
  setStoredSelectedPresetId: (presetId: string | null): void => {
    if (presetId !== null) {
      localStorage.setItem(LS_SELECTED_PRESET_ID_KEY, presetId);
    } else {
      localStorage.removeItem(LS_SELECTED_PRESET_ID_KEY);
    }
  },
};

/**
 * Resolves the best instructions for a given character and language.
 *
 * Priority:
 * 1. Custom character localizedInstructions for the specific language
 * 2. Built-in preset translations (from preset-instructions index)
 * 3. Preset's default instructions field (English / fallback)
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

  // 2. Built-in preset translations
  const translated = getPresetInstructions(characterId, language);
  if (translated) return translated;

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
  | { type: 'SET_CUSTOM_CHARACTERS'; payload: Preset[] }
  | { type: 'SET_SELECTED_PRESET_ID'; payload: string | null }
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
    case 'SET_CUSTOM_CHARACTERS':
      return {
        ...state,
        customCharacters: action.payload,
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
        language: newLanguage,
        instructions: newInstructions,
        initialInstruction:
          languageInitialInstructions[newLanguage] ||
          languageInitialInstructions.en,
      };
    }
    default:
      return state;
  }
}

// Update the context type
interface PlaygroundStateContextProps {
  pgState: PlaygroundState;
  dispatch: Dispatch<Action>;
  helpers: ReturnType<typeof createPlaygroundStateHelpers>;
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

export const PlaygroundStateProvider = ({
  children,
  defaultPresets: defaultPresetsProp,
  initialCustomCharacters = [],
  initialState,
}: PlaygroundStateProviderProps) => {
  const mergedDefaultPresets = defaultPresetsProp ?? [];
  const helpers = useMemo(
    () => createPlaygroundStateHelpers(mergedDefaultPresets),
    [mergedDefaultPresets],
  );
  const mergedInitialState: PlaygroundState = useMemo(
    () => ({
      ...defaultPlaygroundState,
      defaultPresets: mergedDefaultPresets,
      customCharacters: initialCustomCharacters,
      ...initialState,
      sessionConfig: {
        ...defaultPlaygroundState.sessionConfig,
        ...(initialState?.sessionConfig ?? {}),
      },
    }),
    [initialState, mergedDefaultPresets, initialCustomCharacters],
  );

  const [state, dispatch] = useReducer(
    playgroundStateReducer,
    mergedInitialState,
  );

  useEffect(() => {
    // Read the URL
    const urlData = helpers.decodeFromURLParams(window.location.search);

    if (urlData.state.selectedPresetId) {
      const defaultPreset = helpers
        .getDefaultPresets()
        .find((preset) => preset.id === urlData.state.selectedPresetId);

      if (defaultPreset) {
        dispatch({ type: 'SET_SELECTED_PRESET_ID', payload: defaultPreset.id });
        // Don't clear the URL for default presets
        return;
      }

      // Handle non-default preset from URL
      if (urlData.preset?.name) {
        const newCharacter: Preset = {
          id: urlData.state.selectedPresetId,
          name: urlData.preset.name || 'Shared Character',
          localizedDescriptions: urlData.preset.localizedDescriptions,
          instructions: urlData.state.instructions || '',
          sessionConfig: urlData.state.sessionConfig || defaultSessionConfig,
        };

        const updatedCustomCharacters = [
          ...initialCustomCharacters,
          newCharacter,
        ];
        dispatch({
          type: 'SET_CUSTOM_CHARACTERS',
          payload: updatedCustomCharacters,
        });
        dispatch({
          type: 'SET_SELECTED_PRESET_ID',
          payload: newCharacter.id,
        });
      }

      // Clear the URL for non-default presets
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [helpers, initialCustomCharacters]);

  return (
    <PlaygroundStateContext.Provider
      value={{
        pgState: state,
        dispatch,
        helpers,
      }}
    >
      {children}
    </PlaygroundStateContext.Provider>
  );
};
