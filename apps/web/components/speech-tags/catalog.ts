import type { TtsModel } from '@/lib/tts/models';

/**
 * Inline speech tags for the tag editor. Each provider's catalog drives
 * parsing, chips, unknown-tag highlighting, autocomplete, tag
 * auto-conversion and split-safe cutting.
 */

export type TagProvider = 'grok' | 'voxtral';

interface TagCatalog {
  /** Label of the tag picker button. */
  effectsLabelKey:
    | 'generate.grok.inlineEffectPlaceholder'
    | 'ttsEditor.effects';
  /** Tags performed at one point, grouped for the picker. */
  groups: readonly {
    labelKey:
      | 'generate.grok.inlineEffectPlaceholder'
      | 'ttsEditor.emotions'
      | 'ttsEditor.pace'
      | 'ttsEditor.vocalSounds';
    tags: readonly string[];
  }[];
  /** Tags that wrap text, as open and close pairs. */
  wrappers: readonly (readonly [open: string, close: string])[];
}

const GROK_INSTANT_TAGS = [
  '[pause]',
  '[long-pause]',
  '[laugh]',
  '[chuckle]',
  '[giggle]',
  '[cry]',
  '[sigh]',
  '[breath]',
  '[inhale]',
  '[exhale]',
  '[tsk]',
  '[tongue-click]',
  '[lip-smack]',
  '[hum-tune]',
];

const GROK_WRAPPER_NAMES = [
  'soft',
  'whisper',
  'loud',
  'emphasis',
  'slow',
  'fast',
  'higher-pitch',
  'lower-pitch',
  'build-intensity',
  'decrease-intensity',
  'laugh-speak',
  'sing-song',
  'singing',
];

// https://docs.mistral.ai/studio/audio/text-to-speech/emotion-tags.md
const VOXTRAL_EMOTIONS = [
  'amused',
  'angry',
  'anxious',
  'apologetic',
  'appreciative',
  'assertive',
  'bored',
  'calm',
  'confident',
  'confused',
  'critical',
  'curious',
  'determined',
  'disappointed',
  'disgusted',
  'excited',
  'frustrated',
  'grateful',
  'happy',
  'hopeful',
  'playful',
  'proud',
  'reflective',
  'resigned',
  'sad',
  'sarcastic',
  'skeptical',
  'somber',
  'surprised',
  'tense',
  'tired',
  'urgent',
  'warm',
  'wistful',
];

const VOXTRAL_PACES = ['very-slow', 'slow', 'moderate', 'fast', 'very-fast'];

const VOXTRAL_SOUNDS = [
  'um',
  'uh',
  'laugh',
  'breath',
  'sigh',
  'gasp',
  'sniff',
  'cough',
  'throat clearing',
  'yawn',
  'chuckle',
  'laugh hard',
  'gasping',
  'rire',
];

export const TAG_CATALOGS: Record<TagProvider, TagCatalog> = {
  grok: {
    effectsLabelKey: 'generate.grok.inlineEffectPlaceholder',
    groups: [
      {
        labelKey: 'generate.grok.inlineEffectPlaceholder',
        tags: GROK_INSTANT_TAGS,
      },
    ],
    wrappers: GROK_WRAPPER_NAMES.map(
      (name) => [`<${name}>`, `</${name}>`] as const,
    ),
  },
  // Voxtral tags apply to the text that follows, without a closing tag.
  voxtral: {
    effectsLabelKey: 'ttsEditor.effects',
    groups: [
      {
        labelKey: 'ttsEditor.emotions',
        tags: VOXTRAL_EMOTIONS.map((emotion) => `[emotion=${emotion}]`),
      },
      {
        labelKey: 'ttsEditor.pace',
        tags: VOXTRAL_PACES.map((pace) => `[pace=${pace}]`),
      },
      {
        labelKey: 'ttsEditor.vocalSounds',
        tags: VOXTRAL_SOUNDS.map((sound) => `[${sound}]`),
      },
    ],
    wrappers: [],
  },
};

/** The catalog of a TTS voice's text: only Grok voices take tags as chips. */
export function ttsTagProvider(
  model: TtsModel | undefined,
): TagProvider | undefined {
  return model?.provider === 'grok' ? 'grok' : undefined;
}

export function instantTags(provider: TagProvider): string[] {
  return TAG_CATALOGS[provider].groups.flatMap(({ tags }) => tags);
}

/** Tag chips in the editor and in read-only tagged text. */
export const TAG_CHIP_CLASS =
  'inline-flex rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground';

/** Keeps an empty wrapper editable; serialization drops it. */
export const EMPTY_WRAPPER_TEXT = ' ';
