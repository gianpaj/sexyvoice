export const FEATURED_VOICE_SORT_ORDER = 0;

export function isFeaturedVoice(
  voice: Pick<Tables<'voices'>, 'sort_order'>,
): boolean {
  return voice.sort_order === FEATURED_VOICE_SORT_ORDER;
}

export function getFeaturedVoice(
  voices: Tables<'voices'>[],
): Tables<'voices'> | undefined {
  return voices.find(isFeaturedVoice);
}
