import { logger } from '@sentry/nextjs';

const SAFEGUARD_POLICY =
  'Classify TTS prompts as VALID (adult voice permitted) or INVALID (minor/child voice blocked). INVALID includes: children, kids, minors under 18, childlike voices, little boy/girl, young child, teen, adolescent, baby, toddler, school kid, cartoon kids. VALID = adult, mature, elderly, professional voices only. Respond ONLY with VALID or INVALID.';

const SAFEGUARD_MODEL = 'openai/gpt-oss-safeguard-20b';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface SafeguardResult {
  isValid: boolean;
  prompt: string;
  result: 'VALID' | 'INVALID' | 'ERROR';
  errorMessage?: string;
}

interface GroqChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Validates a prompt against the safeguard policy to ensure it doesn't
 * request generation of minor/child voices.
 *
 * Uses harmony format with system role for policy and user role for prompt
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
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      logger.error('GROQ_API_KEY is not configured', {
        user: { id: userId },
      });
      return {
        isValid: false,
        prompt,
        result: 'ERROR',
        errorMessage: 'Safeguard service not configured',
      };
    }

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        messages: [
          // Policy as system instruction (harmony format)
          {
            role: 'system',
            content: SAFEGUARD_POLICY,
          },
          {
            role: 'user',
            content: `Classify the following prompt:\n\n"${prompt}"`,
          },
        ],
        model: SAFEGUARD_MODEL,
        temperature: 1,
        max_completion_tokens: 10,
        top_p: 1,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = (await response.json()) as GroqChatResponse;
    const text = data.choices?.[0]?.message?.content || '';

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
