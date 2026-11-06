import { VOXTRAL_SUPPORTED_LOCALE_CODES } from './constants';

/**
 * Voice-cloning providers. One-off clones use Mistral Voxtral for its
 * locales and Replicate Chatterbox for the rest; saved call voices use
 * Inworld or Mistral (`CALL_CLONE_PROVIDER`).
 */
export type CloneProvider = 'inworld' | 'mistral' | 'replicate';

interface CloneProviderSpec {
  /** Longer reference audio is trimmed to this many seconds. */
  maxReferenceSeconds: number;
  /** Shortest reference audio accepted, in seconds. */
  minReferenceSeconds: number;
  /** Provider model stored in `audio_files.model`. */
  model: string;
  /** Maximum text characters per request, by tier. */
  textLimit: { free: number; paid: number };
}

export const CLONE_PROVIDERS = {
  inworld: {
    maxReferenceSeconds: 30,
    minReferenceSeconds: 10, // Inworld accepts 3
    model: 'inworld-tts-2',
    // Inworld's non-streaming limit, in UTF-16 code units.
    textLimit: { free: 2000, paid: 2000 },
  },
  mistral: {
    maxReferenceSeconds: 25,
    minReferenceSeconds: 10, // Mistral accepts 3
    model: 'voxtral-mini-tts-3-0',
    textLimit: { free: 1000, paid: 4000 },
  },
  replicate: {
    maxReferenceSeconds: 10,
    minReferenceSeconds: 10,
    model: 'resemble-ai/chatterbox-multilingual',
    textLimit: { free: 300, paid: 300 },
  },
} as const satisfies Record<CloneProvider, CloneProviderSpec>;

/** Every model stored for cloned speech, retired ones included, for reports. */
export const VOICE_CLONING_MODELS: readonly string[] = [
  ...Object.values(CLONE_PROVIDERS).map((provider) => provider.model),
  'resemble-ai/chatterbox',
  'voxtral-mini-tts-2603',
];

/** One-off clones speak Voxtral locales through Mistral, the rest through Chatterbox. */
export function oneOffCloneProvider(locale: string): 'mistral' | 'replicate' {
  return VOXTRAL_SUPPORTED_LOCALE_CODES.has(locale) ? 'mistral' : 'replicate';
}

/** Saved voices belong to paid users, so callers pass `isPaidUser: true` for them. */
export function cloneTextLimit(
  provider: CloneProvider,
  isPaidUser: boolean,
): number {
  const { textLimit } = CLONE_PROVIDERS[provider];
  return isPaidUser ? textLimit.paid : textLimit.free;
}
