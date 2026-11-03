import type { Content, VoiceConfig } from '@google/genai';

// Shared Gemini TTS prompt + model resolution.
//
// Both the credit estimate (`/api/estimate-credits`) and the real generation
// (`/api/generate-voice`) must build the *same* prompt string and target the
// *same* model, otherwise the estimate counts tokens for a different request
// than the one that actually runs and the two credit numbers diverge.

export const GEMINI_TTS_38 = 'gemini-3.8-flash-tts';

function assertGeminiTtsModel(model: string): asserts model is 'gpro38' {
  if (model !== 'gpro38') throw new Error('Unsupported Gemini TTS model');
}

/** Reject unsupported catalogs rather than selecting a different provider model. */
export function resolveGeminiTtsModel({ model }: { model: string }): string {
  assertGeminiTtsModel(model);
  return GEMINI_TTS_38;
}

/** Direction is separate from the transcript in Gemini speech metadata. */
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
  model: string,
): VoiceConfig {
  assertGeminiTtsModel(model);
  const isExtendedId = voiceName.includes('-');
  const name = isExtendedId
    ? voiceName
    : voiceName.charAt(0).toUpperCase() + voiceName.slice(1);
  return { voice: name };
}
