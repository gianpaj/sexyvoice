import type { Content, VoiceConfig } from '@google/genai';

// Shared Gemini TTS prompt + model resolution.
//
// Both the credit estimate (`/api/estimate-credits`) and the real generation
// (`/api/generate-voice`) must build the *same* prompt string and target the
// *same* model, otherwise the estimate counts tokens for a different request
// than the one that actually runs and the two credit numbers diverge.

export const GEMINI_TTS_FLASH_FREE = 'gemini-2.5-flash-preview-tts';
export const GEMINI_TTS_PRO = 'gemini-2.5-pro-preview-tts';
export const GEMINI_TTS_38 = 'gemini-3.8-flash-tts';
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
  // Explicit 3.x voices use their chosen model on every tier.
  // Gemini 2.5 uses Pro for paid users and Flash for free users.
  if (model === 'gpro38') return GEMINI_TTS_38;
  if (model === 'gpro31') {
    return GEMINI_TTS_31;
  }
  return userHasPaid ? GEMINI_TTS_PRO : GEMINI_TTS_FLASH_FREE;
}

/**
 * Build the effective text payload sent to Gemini. The gpro31 (Gemini 3.1)
 * model follows direction best when the style and transcript are sent as
 * labelled sections; the 2.5 models take an inline `style: text` prefix.
 * Gemini 3.8 returns the transcript unchanged; direction belongs in speechMetadata.
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
  styleVariant?: string;
}): string {
  if (!styleVariant || model === 'gpro38') {
    return text;
  }
  return model === 'gpro31'
    ? `### DIRECTOR'S NOTES\nStyle: ${styleVariant}\n\n## TRANSCRIPT\n${text}`
    : `${styleVariant}: ${text}`;
}

/** Accepts the effective prompt from buildGeminiTtsPrompt. */
export function buildGeminiTtsContents({
  model,
  text,
  styleVariant,
}: {
  model: string;
  text: string;
  styleVariant?: string;
}): Content[] {
  return [
    {
      parts: [
        {
          text,
          ...(model === 'gpro38' && styleVariant
            ? { speechMetadata: { style: styleVariant } }
            : {}),
        },
      ],
      role: 'user',
    },
  ];
}

/**
 * Shared identities (`kore`, `puck`, ...) are stored lowercase and Google
 * expects them capitalized on every model. Gemini 3.8 also accepts extended
 * catalog ids such as `es-es-advisor-8`, which are sent verbatim.
 */
export function buildGeminiVoiceConfig(
  voiceName: string,
  model?: string,
): VoiceConfig {
  const isExtendedId = model === 'gpro38' && voiceName.includes('-');
  const name = isExtendedId
    ? voiceName
    : voiceName.charAt(0).toUpperCase() + voiceName.slice(1);
  return model === 'gpro38'
    ? { voice: name }
    : { prebuiltVoiceConfig: { voiceName: name } };
}
