import {
  type CallLanguage,
  DEFAULT_CALL_LANGUAGE,
} from '@/lib/calls/languages';
import { defaultSessionConfig, instructions } from './default-config';
import type { Preset } from './presets';
import type { SessionConfig } from './session-config';

/** Unsaved character fields in the creator. */
export interface CustomCallDraft {
  description: string;
  instructions: string;
  name: string;
  sessionConfig: SessionConfig;
}

export interface PlaygroundState {
  /** User-created custom characters */
  customCharacters: Preset[];
  defaultPresets: Preset[];
  instructions: string;
  language: CallLanguage;
  /** Per-call memory flag. The server also applies the profile preference. */
  memory: boolean;
  sceneInstructions: string;
  selectedPresetId: string | null;
  selectedSceneId: string | null;
  sessionConfig: SessionConfig;
}

// Define the initial state
export const defaultPlaygroundState: PlaygroundState = {
  customCharacters: [],
  defaultPresets: [], // Now populated from DB via SSR props
  instructions,
  language: DEFAULT_CALL_LANGUAGE,
  memory: true,
  sceneInstructions: '',
  selectedPresetId: null,
  selectedSceneId: null,
  sessionConfig: { ...defaultSessionConfig },
};
