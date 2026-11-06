import { type Character, DEFAULT_SESSION_CONFIG } from '@/lib/calls/characters';

/** A custom character with empty optional fields. */
export const makeCharacter = (
  fields: Partial<Character> & Pick<Character, 'id' | 'name'>,
): Character => ({
  isPublic: false,
  localizedDescriptions: {},
  localizedPrompts: {},
  localizedSampleUrls: {},
  prompt: '',
  sessionConfig: { ...DEFAULT_SESSION_CONFIG },
  ...fields,
});
