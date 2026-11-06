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

import { callScenes, isSceneTextModified } from '@/data/call-scenes';
import {
  defaultPlaygroundState,
  type PlaygroundState,
} from '@/data/playground-state';
import type { Character } from '@/lib/calls/characters';
import type { CallLanguage } from '@/lib/calls/languages';
import { createPlaygroundStateHelpers } from '@/lib/playground-state-helpers';

// Define action types and payloads
type Action =
  | { type: 'SET_SCENE_INSTRUCTIONS'; payload: string }
  | { type: 'SET_SELECTED_PRESET_ID'; payload: string | null }
  | { type: 'SET_SELECTED_SCENE_ID'; payload: string | null }
  | { type: 'SAVE_CUSTOM_CHARACTER'; payload: Character }
  | { type: 'DELETE_CUSTOM_CHARACTER'; payload: string }
  | {
      type: 'RESTORE_CUSTOM_CHARACTER';
      payload: { index: number; preset: Character };
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
    case 'SET_SELECTED_PRESET_ID':
      return { ...state, selectedPresetId: action.payload };
    case 'SET_SELECTED_SCENE_ID': {
      const selectedScene = callScenes.find(
        (scene) => scene.id === action.payload,
      );
      // Text the user wrote carries over to the next scene.
      return {
        ...state,
        sceneInstructions: isSceneTextModified(
          state.selectedSceneId,
          state.sceneInstructions,
        )
          ? state.sceneInstructions
          : (selectedScene?.text ?? ''),
        selectedSceneId: action.payload,
      };
    }
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
        (character: Character) => character.id !== action.payload,
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
    case 'SET_LANGUAGE':
      return { ...state, language: action.payload };
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
  defaultPresets?: Character[];
  initialCustomCharacters?: Character[];
  initialState?: Partial<PlaygroundState>;
}

const EMPTY_PRESETS: Character[] = [];

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
  };

  const [state, dispatch] = useReducer(
    playgroundStateReducer,
    mergedInitialState,
  );

  const selectPreset = (presetId: string | null) => {
    dispatch({ payload: presetId, type: 'SET_SELECTED_PRESET_ID' });
    helpers.updateBrowserUrl(presetId);
  };

  // Mount only. The URL is read once and rewritten to match; re-running this
  // against a later render's props would drop a character created in this
  // session.
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
