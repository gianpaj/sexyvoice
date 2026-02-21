import type { SessionConfig } from './session-config';
import type { FeatureType } from './voices';

export type PresetIconId = 'headphones';

export interface Preset {
  id: string; // characters.id UUID
  name: string;
  localizedDescriptions?: Partial<Record<string, string>>;
  instructions: string; // maps to prompts.prompt (via characters.prompt_id)
  localizedInstructions?: Partial<Record<string, string>>; // maps to prompts.localized_prompts
  sessionConfig: SessionConfig;
  iconId?: PresetIconId;
  image?: string;
  promptId?: string; // FK to prompts table
  promptType?: FeatureType; // mirrors prompts.type (shared feature_type enum)
  voiceId?: string; // FK to voices table (UUID)
  voiceName?: string; // resolved voice name for display
  voiceSampleUrl?: string; // for play button
  isPublic?: boolean; // true for predefined characters
}

// REMOVED: defaultPresets array — now fetched from DB (characters + prompts tables)
