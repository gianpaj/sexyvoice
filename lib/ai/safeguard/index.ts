import { groq } from '@ai-sdk/groq';
import { logger } from '@sentry/nextjs';
import { generateText } from 'ai';

const SAFEGUARD_POLICY =
  'Classify TTS prompts as VALID (adult voice permitted) or INVALID (minor/child voice blocked). INVALID includes: children, kids, minors under 18, childlike voices, little boy/girl, young child, teen, adolescent, baby, toddler, school kid, cartoon kids. VALID = adult, mature, sexual, consensual voices only. Respond ONLY with VALID or INVALID.';

export interface SafeguardResult {
  isValid: boolean;
  prompt: string;
  result: 'VALID' | 'INVALID' | 'ERROR';
  errorMessage?: string;
}

/**
 * Validates a prompt against the safeguard policy to ensure it doesn't
 * request generation of minor/child voices.
 *
 * Uses harmony format with system role for policy and user role for prompt,
 * matching how the gpt-oss-safeguard-20b model was trained.
 *
 * @param prompt - The text prompt to validate
 * @param userId - The user ID for logging purposes
 * @returns SafeguardResult indicating if the prompt is valid
 */
export async function validatePromptSafeguard(
  prompt: string,
  userId: string,
): Promise<SafeguardResult> {
  try {
    const { text } = await generateText({
      model: groq('openai/gpt-oss-safeguard-20b'),
      system: SAFEGUARD_POLICY,
      messages: [
        {
          role: 'user',
          content: `Classify the following prompt:\n\n"${prompt}"`,
        },
      ],
      temperature: 1,
      maxOutputTokens: 250,
      topP: 1,
    });

    const normalizedResult = text.trim().toUpperCase();
    const isValid = normalizedResult === 'VALID';

    if (!isValid) {
      logger.warn('Safeguard policy violation detected', {
        user: { id: userId },
        extra: {
          prompt: prompt.substring(0, 200), // Log only first 200 chars for privacy
          result: normalizedResult,
        },
      });
    }

    return {
      isValid,
      prompt,
      result:
        normalizedResult === 'VALID' || normalizedResult === 'INVALID'
          ? normalizedResult
          : 'ERROR',
    };
  } catch (error) {
    logger.error('Safeguard policy check failed', {
      user: { id: userId },
      extra: {
        prompt: prompt.substring(0, 200),
        error: error instanceof Error ? error.message : String(error),
      },
    });

    // Fail-open in production to avoid blocking legitimate users due to API errors
    // Log the error for monitoring and later review
    // TODO: Save to database for reporting and banning when table is ready
    const failOpen = process.env.NODE_ENV === 'production';

    return {
      isValid: failOpen,
      prompt,
      result: 'ERROR',
      errorMessage:
        error instanceof Error ? error.message : 'Safeguard check failed',
    };
  }
}
