import { defaultSessionConfig } from './default-config';
import { lilyInstructions } from './preset-instructions/lily';
import { miloInstructions } from './preset-instructions/milo';
import { rafalInstructions } from './preset-instructions/rafal';
import { ramonaInstructions } from './preset-instructions/ramona';
import type { SessionConfig } from './session-config';
import { VoiceId } from './voices';

export type PresetIconId = 'headphones';

export interface Preset {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  sessionConfig: SessionConfig;
  iconId?: PresetIconId;
  image?: string;
}

export const defaultPresets: Preset[] = [
  {
    id: 'ramona',
    name: 'Ramona',
    description:
      'Dominant businesswoman from Colombia. Commands attention but sophisticated in desires.',
    image: 'ramona.webp',
    instructions: ramonaInstructions.en,
    sessionConfig: {
      ...defaultSessionConfig,
      voice: VoiceId.EVE,
    },
    iconId: 'headphones',
  },
  {
    id: 'lily',
    name: 'Lily',
    description: '18yo Japanese student girl. Shy, hesitant, obedient.',
    image: 'lily.webp',
    instructions: lilyInstructions.en,
    sessionConfig: {
      ...defaultSessionConfig,
      voice: VoiceId.ARA,
    },
    iconId: 'headphones',
  },
  {
    id: 'milo',
    name: 'Milo',
    description: '24yo trans woman. Enthusiastic, unashamed, zero boundaries.',
    image: 'milo.webp',
    instructions: miloInstructions.en,
    sessionConfig: {
      ...defaultSessionConfig,
      voice: VoiceId.SAL,
    },
    iconId: 'headphones',
  },
  {
    id: 'rafal',
    name: 'Rafal',
    description: '35yo dominant BEAR male. Large, muscular, hairy.',
    image: 'rafal.webp',
    instructions: rafalInstructions.en,
    sessionConfig: {
      ...defaultSessionConfig,
      voice: VoiceId.REX,
    },
    iconId: 'headphones',
  },
];
