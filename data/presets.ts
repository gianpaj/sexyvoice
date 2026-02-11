import { defaultSessionConfig } from './default-config';
import {
  lilyDescriptions,
  miloDescriptions,
  rafalDescriptions,
  ramonaDescriptions,
} from './preset-descriptions';
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
  /** Per-language descriptions keyed by CallLanguage code */
  localizedDescriptions?: Partial<Record<string, string>>;
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
    localizedDescriptions: ramonaDescriptions,
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
    localizedDescriptions: lilyDescriptions,
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
    localizedDescriptions: miloDescriptions,
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
    localizedDescriptions: rafalDescriptions,
    image: 'rafal.webp',
    instructions: rafalInstructions.en,
    sessionConfig: {
      ...defaultSessionConfig,
      voice: VoiceId.REX,
    },
    iconId: 'headphones',
  },
];
