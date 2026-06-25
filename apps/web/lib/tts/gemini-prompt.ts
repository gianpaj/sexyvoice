// Shared Gemini TTS prompt + model resolution.
//
// Both the credit estimate (`/api/estimate-credits`) and the real generation
// (`/api/generate-voice`) must build the *same* prompt string and target the
// *same* model, otherwise the estimate counts tokens for a different request
// than the one that actually runs and the two credit numbers diverge.

export const GEMINI_TTS_FLASH_FREE = 'gemini-2.5-flash-preview-tts';
export const GEMINI_TTS_PRO = 'gemini-2.5-pro-preview-tts';
export const GEMINI_TTS_31 = 'gemini-3.1-flash-tts-preview';

/**
 * The effective Gemini model a request runs on, given the stored voice model
 * and the user's tier. Mirrors the selection in `generate-voice` (both the
 * cache-hash `effectiveModel` and the runtime `modelUsed`).
 */
export function resolveGeminiTtsModel({
  model,
  userHasPaid,
}: {
  model: string;
  userHasPaid: boolean;
}): string {
  if (!userHasPaid) {
    return GEMINI_TTS_FLASH_FREE;
  }
  return model === 'gpro31' ? GEMINI_TTS_31 : GEMINI_TTS_PRO;
}

/**
 * Build the effective text payload sent to Gemini. The gpro31 (Gemini 3.1)
 * model follows direction best when the style and transcript are sent as
 * labelled sections; the 2.5 models take an inline `style: text` prefix.
 *
 * `styleVariant` is ignored for non-Gemini voices, so callers should only pass
 * it for Gemini voices.
 */
export function buildGeminiTtsPrompt({
  model,
  text,
  styleVariant,
}: {
  model: string;
  text: string;
  styleVariant: string;
}): string {
  if (!styleVariant) {
    return text;
  }
  return model === 'gpro31'
    ? `### DIRECTOR'S NOTES\nStyle: ${styleVariant}\n\n## TRANSCRIPT\n${text}`
    : `${styleVariant}: ${text}`;
}
