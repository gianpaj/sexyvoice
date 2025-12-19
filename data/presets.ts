import { Headphones } from 'lucide-react';

import {
  defaultSessionConfig,
  instructions,
  type SessionConfig,
} from './playground-state';
import { VoiceId } from './voices';

export interface Preset {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  sessionConfig: SessionConfig;
  defaultGroup?: PresetGroup;
  icon?: React.ComponentType<{ className?: string }>;
}

// biome-ignore lint/style/noEnum: fine
export enum PresetGroup {
  // FUNCTIONALITY = "Use-Case Demos",
  PERSONALITY = 'Fun Style & Personality Demos',
}

export const defaultPresets: Preset[] = [
  {
    id: 'porn-whisper',
    name: 'Porn Whisper',
    description: 'Your soft, seductive Amanda like in adult films.',
    instructions,
    sessionConfig: {
      ...defaultSessionConfig,
      voice: VoiceId.ARA,
    },
    defaultGroup: PresetGroup.PERSONALITY,
    icon: Headphones,
  },
];
