'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
} from 'react';

import { type Character, MAX_CUSTOM_CHARACTERS } from '@/lib/calls/characters';
import type { CallLanguage } from '@/lib/calls/languages';
import { callScenes, isSceneTextModified } from '@/lib/calls/scenes';

/** What the user chooses before a call. */
interface CallSetupState {
  customCharacters: Character[];
  language: CallLanguage;
  sceneId: string | null;
  sceneText: string;
  selectedId: string | null;
}

type CallSetupAction =
  | { id: string | null; type: 'select' }
  | { language: CallLanguage; type: 'language' }
  | { id: string | null; type: 'scene' }
  | { text: string; type: 'scene-text' }
  | { character: Character; type: 'save' }
  | { id: string; type: 'remove' }
  | { character: Character; index: number; type: 'restore' };

function reduceSetup(
  state: CallSetupState,
  action: CallSetupAction,
): CallSetupState {
  switch (action.type) {
    case 'select':
      return { ...state, selectedId: action.id };
    case 'language':
      return { ...state, language: action.language };
    case 'scene': {
      const scene = callScenes.find(({ id }) => id === action.id);
      // Text the user wrote carries over to the next scene.
      return {
        ...state,
        sceneId: action.id,
        sceneText: isSceneTextModified(state.sceneId, state.sceneText)
          ? state.sceneText
          : (scene?.text ?? ''),
      };
    }
    case 'scene-text':
      return { ...state, sceneText: action.text };
    case 'save': {
      const { character } = action;
      const saved = state.customCharacters.some(
        ({ id }) => id === character.id,
      );
      return {
        ...state,
        customCharacters: saved
          ? state.customCharacters.map((existing) =>
              existing.id === character.id ? character : existing,
            )
          : [...state.customCharacters, character],
      };
    }
    case 'remove':
      return {
        ...state,
        customCharacters: state.customCharacters.filter(
          ({ id }) => id !== action.id,
        ),
      };
    case 'restore': {
      const { character, index } = action;
      if (state.customCharacters.some(({ id }) => id === character.id)) {
        return state;
      }
      const customCharacters = [...state.customCharacters];
      customCharacters.splice(
        Math.min(index, customCharacters.length),
        0,
        character,
      );
      return { ...state, customCharacters };
    }
    default:
      return state;
  }
}

const CHARACTER_PARAM = 'preset';

/**
 * Query params the call page owns: `preset`, which it writes; `custom` and
 * `voice`, from the Clone page; and the prompt and session settings old links
 * carried. Everything else in the URL belongs to someone else.
 */
const isOwnedUrlParam = (key: string) =>
  key === CHARACTER_PARAM ||
  key === 'custom' ||
  key === 'voice' ||
  key === 'instructions' ||
  key === 'presetName' ||
  key === 'presetDescription' ||
  key.startsWith('sessionConfig.');

/**
 * Writes the selected character to the URL as `?preset=<id>`, so a refresh
 * restores it. Prompts and session settings load from the database and stay
 * out of browser history and analytics.
 *
 * `historyState` defaults to `null`, Next's documented shallow-update pattern:
 * its patched `replaceState` copies the router tree into the new entry and
 * syncs the router's URL. A state carrying Next's `__NA` flag skips that sync,
 * so a later router refresh would restore the old URL. A caller that runs
 * before Next installs its patch passes `window.history.state` instead, so the
 * tree survives and Back does not reload the page.
 */
function writeCharacterParam(id: string | null, historyState: unknown = null) {
  const params = new URLSearchParams(window.location.search);
  for (const key of [...params.keys()]) {
    if (isOwnedUrlParam(key)) params.delete(key);
  }
  if (id) params.set(CHARACTER_PARAM, id);
  const search = params.toString();
  window.history.replaceState(
    historyState,
    '',
    `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
  );
}

interface CallSetupContextValue {
  atCharacterLimit: boolean;
  /** Predefined characters, then the user's own. */
  characters: Character[];
  customCharacters: Character[];
  language: CallLanguage;
  predefinedCharacters: Character[];
  /** Removes a custom character; selecting the default if it was selected. */
  removeCharacter: (id: string) => void;
  /** Puts a removed character back at its place in the list. */
  restoreCharacter: (character: Character, index: number) => void;
  /** Adds a custom character, or replaces the saved one with its ID. */
  saveCharacter: (character: Character) => void;
  sceneId: string | null;
  sceneText: string;
  selectCharacter: (id: string | null) => void;
  selected: Character | undefined;
  selectScene: (id: string | null) => void;
  setLanguage: (language: CallLanguage) => void;
  setSceneText: (text: string) => void;
}

const CallSetupContext = createContext<CallSetupContextValue | undefined>(
  undefined,
);

export function useCallSetup(): CallSetupContextValue {
  const context = useContext(CallSetupContext);
  if (!context) {
    throw new Error('useCallSetup must be used within a CallSetupProvider');
  }
  return context;
}

const NO_CHARACTERS: Character[] = [];

/** The characters, the selected one, the call language and the scene. */
export function CallSetupProvider({
  children,
  customCharacters: initialCustomCharacters = NO_CHARACTERS,
  language: initialLanguage,
  linkedCharacterId = null,
  predefinedCharacters = NO_CHARACTERS,
}: {
  children: ReactNode;
  customCharacters?: Character[];
  language: CallLanguage;
  /** The loaded character a `?preset=` link named; the page checks it. */
  linkedCharacterId?: string | null;
  predefinedCharacters?: Character[];
}) {
  const defaultId = predefinedCharacters[0]?.id ?? null;
  const [state, dispatch] = useReducer(reduceSetup, {
    customCharacters: initialCustomCharacters,
    language: initialLanguage,
    sceneId: null,
    sceneText: '',
    selectedId: linkedCharacterId ?? defaultId,
  });

  // Mount only: rewrite the page link to the URL contract. Old links carry
  // prompts in the query string, and a `preset` the page did not load
  // belongs to another user or a deleted character. On a full page load this
  // runs before Next patches `replaceState`, so the current state is kept.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the page link is read once
  useEffect(() => {
    if (window.location.search) {
      writeCharacterParam(linkedCharacterId, window.history.state);
    }
  }, []);

  const characters = [...predefinedCharacters, ...state.customCharacters];
  const selectCharacter = (id: string | null) => {
    dispatch({ id, type: 'select' });
    writeCharacterParam(id);
  };

  return (
    <CallSetupContext.Provider
      value={{
        atCharacterLimit:
          state.customCharacters.length >= MAX_CUSTOM_CHARACTERS,
        characters,
        customCharacters: state.customCharacters,
        language: state.language,
        predefinedCharacters,
        removeCharacter: (id) => {
          dispatch({ id, type: 'remove' });
          if (state.selectedId === id) selectCharacter(defaultId);
        },
        restoreCharacter: (character, index) =>
          dispatch({ character, index, type: 'restore' }),
        saveCharacter: (character) => dispatch({ character, type: 'save' }),
        sceneId: state.sceneId,
        sceneText: state.sceneText,
        selectCharacter,
        selected: characters.find(({ id }) => id === state.selectedId),
        selectScene: (id) => dispatch({ id, type: 'scene' }),
        setLanguage: (language) => dispatch({ language, type: 'language' }),
        setSceneText: (text) => dispatch({ text, type: 'scene-text' }),
      }}
    >
      {children}
    </CallSetupContext.Provider>
  );
}
