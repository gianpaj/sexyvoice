/**
 * Starter personalities in the character creator. Each key has a label,
 * tagline and prompt under `call.creator.examples` in every messages file.
 */
export const CALL_PERSONALITY_EXAMPLES = [
  'tutor',
  'coach',
  'friend',
  'debate',
  'story',
] as const;

export type CallPersonalityExample = (typeof CALL_PERSONALITY_EXAMPLES)[number];
