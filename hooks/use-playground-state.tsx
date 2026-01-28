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
import {
  defaultPresets as baseDefaultPresets,
  type Preset,
} from '@/data/presets';
import { createPlaygroundStateHelpers } from '@/lib/playground-state-helpers';

const LS_USER_PRESETS_KEY = 'PG_USER_PRESETS';
const LS_SELECTED_PRESET_ID_KEY = 'PG_SELECTED_PRESET_ID';

const presetStorageHelper = {
  getStoredPresets: (): Preset[] => {
    const storedPresets = localStorage.getItem(LS_USER_PRESETS_KEY);
    return storedPresets ? JSON.parse(storedPresets) : [];
  },
  setStoredPresets: (presets: Preset[]): void => {
    localStorage.setItem(LS_USER_PRESETS_KEY, JSON.stringify(presets));
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
};

// Define action types and payloads
type Action =
  | {
      type: 'SET_SESSION_CONFIG';
      payload: Partial<PlaygroundState['sessionConfig']>;
    }
  | { type: 'SET_INSTRUCTIONS'; payload: string }
  | { type: 'SET_USER_PRESETS'; payload: Preset[] }
  | { type: 'SET_SELECTED_PRESET_ID'; payload: string | null }
  | { type: 'SAVE_USER_PRESET'; payload: Preset }
  | { type: 'DELETE_USER_PRESET'; payload: string }
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
    case 'SET_USER_PRESETS':
      return {
        ...state,
        userPresets: action.payload,
      };
    case 'SET_SELECTED_PRESET_ID': {
      presetStorageHelper.setStoredSelectedPresetId(action.payload);

      const newState = {
        ...state,
        selectedPresetId: action.payload,
      };

      const helpers = createPlaygroundStateHelpers(state.defaultPresets);
      newState.instructions =
        helpers.getSelectedPreset(newState)?.instructions || '';
      newState.sessionConfig =
        helpers.getSelectedPreset(newState)?.sessionConfig ||
        defaultSessionConfig;
      return newState;
    }
    case 'SAVE_USER_PRESET': {
      const updatedPresetsAdd = state.userPresets.map((preset) =>
        preset.id === action.payload.id ? action.payload : preset,
      );
      if (
        !updatedPresetsAdd.some((preset) => preset.id === action.payload.id)
      ) {
        updatedPresetsAdd.push(action.payload);
      }
      presetStorageHelper.setStoredPresets(updatedPresetsAdd);
      return {
        ...state,
        userPresets: updatedPresetsAdd,
      };
    }
    case 'DELETE_USER_PRESET': {
      const updatedPresetsDelete = state.userPresets.filter(
        (preset: Preset) => preset.id !== action.payload,
      );
      presetStorageHelper.setStoredPresets(updatedPresetsDelete);
      return {
        ...state,
        userPresets: updatedPresetsDelete,
      };
    }
    case 'SET_LANGUAGE':
      return {
        ...state,
        language: action.payload,
        initialInstruction:
          languageInitialInstructions[action.payload] ||
          languageInitialInstructions.en,
      };
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
    // Load presets from localStorage
    const storedPresets = localStorage.getItem(LS_USER_PRESETS_KEY);
    let userPresets = storedPresets ? JSON.parse(storedPresets) : [];

    // Validate and fix invalid model IDs in stored presets
    userPresets = userPresets.map((preset: Preset) => {
      // Check if the preset has an invalid model ID
      if (!Object.values(ModelId).includes(preset.sessionConfig.model)) {
        return {
          ...preset,
          sessionConfig: {
            ...preset.sessionConfig,
            model: defaultSessionConfig.model,
          },
        };
      }
      return preset;
    });

    // Save cleaned presets back to storage
    if (userPresets.length > 0) {
      presetStorageHelper.setStoredPresets(userPresets);
    }

    dispatch({ type: 'SET_USER_PRESETS', payload: userPresets });

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
        const newPreset: Preset = {
          id: urlData.state.selectedPresetId,
          name: urlData.preset.name || 'Shared Preset',
          description: urlData.preset.description,
          instructions: urlData.state.instructions || '',
          sessionConfig: urlData.state.sessionConfig || defaultSessionConfig,
          defaultGroup: undefined,
        };

        const updatedUserPresets = [...userPresets, newPreset];
        presetStorageHelper.setStoredPresets(updatedUserPresets);
        dispatch({ type: 'SET_USER_PRESETS', payload: updatedUserPresets });
        dispatch({ type: 'SET_SELECTED_PRESET_ID', payload: newPreset.id });
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
