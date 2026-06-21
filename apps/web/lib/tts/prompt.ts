/**
 * Build the final prompt text sent to the TTS provider.
 *
 * For Gemini voices with a style, the gemini-3.1 (gpro31) model follows
 * direction best when style and transcript are sent as labelled sections;
 * the 2.5 models take an inline prefix. Non-Gemini providers ignore style.
 *
 * Shared by /api/generate-voice and /api/v1/speech so the two stay in sync.
 */
export function buildStyledText({
  dbModel,
  isGeminiVoice,
  style,
  text,
}: {
  dbModel: string;
  isGeminiVoice: boolean;
  style?: string;
  text: string;
}): string {
  if (isGeminiVoice && style) {
    return dbModel === 'gpro31'
      ? `### DIRECTOR'S NOTES\nStyle: ${style}\n\n## TRANSCRIPT\n${text}`
      : `${style}: ${text}`;
  }
  return text;
}
