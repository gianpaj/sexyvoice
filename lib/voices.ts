export interface FeaturedVoiceMatcher {
  model?: string;
  name: string;
}

export const FEATURED_TTS_VOICE: FeaturedVoiceMatcher = {
  model: 'grok',
  name: 'eve',
};

export function isFeaturedVoice(
  voice: Pick<Tables<'voices'>, 'name' | 'model'>,
  matcher: FeaturedVoiceMatcher = FEATURED_TTS_VOICE,
): boolean {
  return (
    voice.name.toLowerCase() === matcher.name.toLowerCase() &&
    (matcher.model === undefined || voice.model === matcher.model)
  );
}

export function getFeaturedVoice(
  voices: Tables<'voices'>[],
  matcher: FeaturedVoiceMatcher = FEATURED_TTS_VOICE,
): Tables<'voices'> | undefined {
  return voices.find((voice) => isFeaturedVoice(voice, matcher));
}
