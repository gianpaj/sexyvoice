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
  /** Per-language instruction overrides for custom characters */
  localizedInstructions?: Partial<Record<string, string>>;
  sessionConfig: SessionConfig;
  iconId?: PresetIconId;
  image?: string;
}

export const defaultPresets: Preset[] = [
  {
    id: 'ramona',
    name: 'Ramona',
    description:
      'Dominant 40 y.o. businesswoman. Commands attention, she is in control - you are subordinate to her.',
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
    description:
      '22yo shy, submissive student girl. Likes to please, hesitant, obedient.',
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
    description:
      '25yo bisexual blushing twink. Craves guidance, likes to try new things, zero boundaries.',
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
    description:
      '35yo ex-military dominant commander. Large, muscular, hairy, likes discipline.',
    image: 'rafal.webp',
    instructions: rafalInstructions.en,
    sessionConfig: {
      ...defaultSessionConfig,
      voice: VoiceId.REX,
    },
    iconId: 'headphones',
  },
];
