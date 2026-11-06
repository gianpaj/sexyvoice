import {
  type Character,
  DEFAULT_SESSION_CONFIG,
  type SessionConfig,
} from '@/lib/calls/characters';
import {
  type CallLanguage,
  DEFAULT_CALL_LANGUAGE,
} from '@/lib/calls/languages';

/** Unsaved character fields in the creator. */
export interface CustomCallDraft {
  description: string;
  instructions: string;
  name: string;
  sessionConfig: SessionConfig;
}

export const newCharacterDraft = (
  sessionConfig: SessionConfig = DEFAULT_SESSION_CONFIG,
): CustomCallDraft => ({
  description: '',
  instructions: '',
  name: '',
  sessionConfig: { ...sessionConfig },
});

export interface PlaygroundState {
  /** User-created custom characters */
  customCharacters: Character[];
  defaultPresets: Character[];
  language: CallLanguage;
  sceneInstructions: string;
  selectedPresetId: string | null;
  selectedSceneId: string | null;
}

// Define the initial state
export const defaultPlaygroundState: PlaygroundState = {
  customCharacters: [],
  defaultPresets: [], // Now populated from DB via SSR props
  language: DEFAULT_CALL_LANGUAGE,
  sceneInstructions: '',
  selectedPresetId: null,
  selectedSceneId: null,
};
