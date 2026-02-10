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
import { ModelId } from '@/data/models';
import {
  type CallLanguage,
  defaultPlaygroundState,
  languageInitialInstructions,
  type PlaygroundState,
} from '@/data/playground-state';
import { getPresetInstructions } from '@/data/preset-instructions';
import {
  defaultPresets as baseDefaultPresets,
  type Preset,
} from '@/data/presets';
import { createPlaygroundStateHelpers } from '@/lib/playground-state-helpers';

const LS_CUSTOM_CHARACTERS_KEY = 'PG_CUSTOM_CHARACTERS';
const LS_SELECTED_PRESET_ID_KEY = 'PG_SELECTED_PRESET_ID';
const LS_CHARACTER_OVERRIDES_KEY = 'PG_CHARACTER_OVERRIDES';

const storageHelper = {
  getStoredCustomCharacters: (): Preset[] => {
    const stored = localStorage.getItem(LS_CUSTOM_CHARACTERS_KEY);
    return stored ? JSON.parse(stored) : [];
  },
  setStoredCustomCharacters: (characters: Preset[]): void => {
    localStorage.setItem(LS_CUSTOM_CHARACTERS_KEY, JSON.stringify(characters));
  },
  getStoredSelectedPresetId: (): string =>
    localStorage.getItem(LS_SELECTED_PRESET_ID_KEY) || baseDefaultPresets[0].id,
  setStoredSelectedPresetId: (presetId: string | null): void => {
    if (presetId !== null) {
      localStorage.setItem(LS_SELECTED_PRESET_ID_KEY, presetId);
    } else {
      localStorage.removeItem(LS_SELECTED_PRESET_ID_KEY);
    }
  },
  getStoredCharacterOverrides: (): Record<string, string> => {
    const stored = localStorage.getItem(LS_CHARACTER_OVERRIDES_KEY);
    return stored ? JSON.parse(stored) : {};
  },
  setStoredCharacterOverrides: (
    characterOverrides: Record<string, string>,
  ): void => {
    localStorage.setItem(
      LS_CHARACTER_OVERRIDES_KEY,
      JSON.stringify(characterOverrides),
    );
  },
};

// Define action types and payloads
type Action =
  | {
      type: 'SET_SESSION_CONFIG';
      payload: Partial<PlaygroundState['sessionConfig']>;
    }
  | { type: 'SET_INSTRUCTIONS'; payload: string }
  | {
      type: 'SET_CHARACTER_OVERRIDE';
      payload: { characterId: string; instructions: string };
    }
  | { type: 'LOAD_CHARACTER_OVERRIDES'; payload: Record<string, string> }
  | { type: 'RESET_CHARACTER_OVERRIDE'; payload: string }
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
    case 'SET_CHARACTER_OVERRIDE': {
      const { characterId, instructions } = action.payload;
      const updatedCharacterOverrides = {
        ...state.characterOverrides,
        [characterId]: instructions,
      };
      // Persist to localStorage
      storageHelper.setStoredCharacterOverrides(updatedCharacterOverrides);
      return {
        ...state,
        instructions,
        characterOverrides: updatedCharacterOverrides,
      };
    }
    case 'LOAD_CHARACTER_OVERRIDES':
      return {
        ...state,
        characterOverrides: action.payload,
      };
    case 'RESET_CHARACTER_OVERRIDE': {
      const characterId = action.payload;
      const { [characterId]: _, ...remainingCharacterOverrides } =
        state.characterOverrides;
      // Persist to localStorage
      storageHelper.setStoredCharacterOverrides(remainingCharacterOverrides);
      // Get the default instructions for this character
      const preset = [...state.defaultPresets, ...state.customCharacters].find(
        (p) => p.id === characterId,
      );
      const defaultInstructions = preset?.instructions || '';
      return {
        ...state,
        instructions:
          state.selectedPresetId === characterId
            ? defaultInstructions
            : state.instructions,
        characterOverrides: remainingCharacterOverrides,
      };
    }
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

      // Check for character overrides for this preset, otherwise use preset default
      if (action.payload && state.characterOverrides[action.payload]) {
        newState.instructions = state.characterOverrides[action.payload];
      } else if (action.payload) {
        // Try to get translated instructions for the current language
        const translatedInstructions = getPresetInstructions(
          action.payload,
          state.language,
        );
        if (translatedInstructions) {
          newState.instructions = translatedInstructions;
        } else {
          // Fall back to English instructions from the preset
          newState.instructions = selectedPreset?.instructions || '';
        }
      } else {
        newState.instructions = selectedPreset?.instructions || '';
      }

      newState.sessionConfig =
        selectedPreset?.sessionConfig || defaultSessionConfig;
      return newState;
    }
    case 'SAVE_CUSTOM_CHARACTER': {
      const updatedCharacters = state.customCharacters.map((character) =>
        character.id === action.payload.id ? action.payload : character,
      );
      if (
        !updatedCharacters.some(
          (character) => character.id === action.payload.id,
        )
      ) {
        updatedCharacters.push(action.payload);
      }
      storageHelper.setStoredCustomCharacters(updatedCharacters);
      return {
        ...state,
        customCharacters: updatedCharacters,
      };
    }
    case 'DELETE_CUSTOM_CHARACTER': {
      const updatedCharacters = state.customCharacters.filter(
        (character: Preset) => character.id !== action.payload,
      );
      storageHelper.setStoredCustomCharacters(updatedCharacters);
      return {
        ...state,
        customCharacters: updatedCharacters,
      };
    }
    case 'SET_LANGUAGE': {
      const newLanguage = action.payload;

      // Get translated instructions for the selected character
      let newInstructions = state.instructions;

      // Only update instructions if there are no character overrides for this preset
      // (character overrides take precedence over translations)
      if (
        state.selectedPresetId &&
        !state.characterOverrides[state.selectedPresetId]
      ) {
        // Try to get translated instructions for the selected preset
        const translatedInstructions = getPresetInstructions(
          state.selectedPresetId,
          newLanguage,
        );

        if (translatedInstructions) {
          newInstructions = translatedInstructions;
        } else {
          // Fall back to English instructions from the preset
          const preset = [...state.defaultPresets, ...state.customCharacters].find(
            (p) => p.id === state.selectedPresetId,
          );
          newInstructions = preset?.instructions || state.instructions;
        }
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
  initialState?: Partial<PlaygroundState>;
}

export const PlaygroundStateProvider = ({
  children,
  defaultPresets: defaultPresetsProp,
  initialState,
}: PlaygroundStateProviderProps) => {
  const mergedDefaultPresets = defaultPresetsProp ?? baseDefaultPresets;
  const helpers = useMemo(
    () => createPlaygroundStateHelpers(mergedDefaultPresets),
    [mergedDefaultPresets],
  );
  const mergedInitialState: PlaygroundState = useMemo(
    () => ({
      ...defaultPlaygroundState,
      defaultPresets: mergedDefaultPresets,
      ...initialState,
      sessionConfig: {
        ...defaultPlaygroundState.sessionConfig,
        ...(initialState?.sessionConfig ?? {}),
      },
    }),
    [initialState, mergedDefaultPresets],
  );

  const [state, dispatch] = useReducer(
    playgroundStateReducer,
    mergedInitialState,
  );

  useEffect(() => {
    // Load custom characters from localStorage
    const storedCharacters = localStorage.getItem(LS_CUSTOM_CHARACTERS_KEY);
    let customCharacters = storedCharacters ? JSON.parse(storedCharacters) : [];

    // Validate and fix invalid model IDs in stored characters
    customCharacters = customCharacters.map((character: Preset) => {
      // Check if the character has an invalid model ID
      if (!Object.values(ModelId).includes(character.sessionConfig.model)) {
        return {
          ...character,
          sessionConfig: {
            ...character.sessionConfig,
            model: defaultSessionConfig.model,
          },
        };
      }
      return character;
    });

    // Save cleaned characters back to storage
    if (customCharacters.length > 0) {
      storageHelper.setStoredCustomCharacters(customCharacters);
    }

    dispatch({ type: 'SET_CUSTOM_CHARACTERS', payload: customCharacters });

    // Load character overrides from localStorage
    const storedCharacterOverrides =
      storageHelper.getStoredCharacterOverrides();
    if (Object.keys(storedCharacterOverrides).length > 0) {
      dispatch({
        type: 'LOAD_CHARACTER_OVERRIDES',
        payload: storedCharacterOverrides,
      });
    }

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
          description: urlData.preset.description,
          instructions: urlData.state.instructions || '',
          sessionConfig: urlData.state.sessionConfig || defaultSessionConfig,
        };

        const updatedCustomCharacters = [...customCharacters, newCharacter];
        storageHelper.setStoredCustomCharacters(updatedCustomCharacters);
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
  }, [helpers]);

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
