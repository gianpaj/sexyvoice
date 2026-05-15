import type { SessionConfig } from './session-config';
import type { FeatureType } from './voices';

export type PresetIconId = 'headphones';

export interface Preset {
  iconId?: PresetIconId;
  id: string; // characters.id UUID
  image?: string;
  instructions: string; // maps to prompts.prompt (via characters.prompt_id)
  isPublic?: boolean; // true for predefined characters
  localizedDescriptions?: Partial<Record<string, string>>;
  localizedInstructions?: Partial<Record<string, string>>; // maps to prompts.localized_prompts
  name: string;
  promptId?: string; // FK to prompts table
  promptType?: FeatureType; // mirrors prompts.type (shared feature_type enum)
  sessionConfig: SessionConfig;
  voiceId?: string; // FK to voices table (UUID)
  voiceName?: string; // resolved voice name for display
  voiceSampleUrl?: string; // for play button
}

// REMOVED: defaultPresets array — now fetched from DB (characters + prompts tables)
