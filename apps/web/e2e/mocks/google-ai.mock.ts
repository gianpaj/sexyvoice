import type { Page, Route } from '@playwright/test';

import { estimateGrokCredits } from '@/lib/utils';

/**
 * Google AI Mock Handlers
 *
 * These handlers mock the Google AI API responses at the HTTP level.
 * They intercept API calls to /api/generate-voice, /api/estimate-credits, etc.
 * and return mock responses matching the structure from vitest tests.
 *
 * This approach mirrors the vitest setup but at the HTTP/API level instead of
 * mocking the @google/genai module directly.
 */

/**
 * Mock response for generate-voice API
 * Matches the structure: { url, creditsUsed }
 */
const mockGenerateVoiceResponse = {
  creditsUsed: 12,
  url: 'https://files.sexyvoice.ai/generated-audio-free/test-audio-e2e.wav',
};

/**
 * Mock response for Gemini estimate-credits API.
 * Grok estimates are calculated dynamically to mirror the real bucketed logic.
 */
const mockGeminiEstimateCreditsResponse = {
  estimatedCredits: 15,
  tokens: 150,
};

const MOCK_GROK_VOICES = new Set(['eve', 'rex', 'sal']);

function isMockGrokVoice(voice: unknown): voice is string {
  return typeof voice === 'string' && MOCK_GROK_VOICES.has(voice.toLowerCase());
}

/**
 * Mock enhanced text response (with emotion tags)
 * This simulates the AI text enhancement feature
 */
export const mockEnhancedText =
  '<happy>Enhanced text with emotion tags</happy>';

/**
 * Handler for POST /api/generate-voice
 *
 * Mocks the Google Gemini voice generation API call.
 * Returns a successful response with audio URL and credit info.
 */
async function handleGenerateVoice(route: Route) {
  const request = route.request();
  const postData = request.postDataJSON();

  // Log for debugging
  console.log('[MOCK] generate-voice called with:', {
    text: `${postData?.text?.slice(0, 50)}...`,
    voice: postData?.voice,
  });

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Fulfill with mock response
  await route.fulfill({
    body: JSON.stringify(mockGenerateVoiceResponse),
    contentType: 'application/json',
    status: 200,
  });
}

/**
 * Handler for POST /api/estimate-credits
 *
 * Mocks the Google token counting API for credit estimation.
 */
async function handleEstimateCredits(route: Route) {
  const request = route.request();
  const postData = request.postDataJSON();

  console.log('[MOCK] estimate-credits called with:', {
    text: `${postData?.text?.slice(0, 50)}...`,
    voice: postData?.voice,
  });

  const text = typeof postData?.text === 'string' ? postData.text : '';
  const responseBody = isMockGrokVoice(postData?.voice)
    ? {
        estimatedCredits: estimateGrokCredits(text),
      }
    : mockGeminiEstimateCreditsResponse;

  await route.fulfill({
    body: JSON.stringify(responseBody),
    contentType: 'application/json',
    status: 200,
  });
}

/**
 * Handler for POST /api/generate-text
 *
 * Mocks the AI text enhancement (adds emotion tags).
 * Returns a simple text response (not streamed for simplicity).
 */
async function handleGenerateText(route: Route) {
  const request = route.request();
  const postData = request.postDataJSON();

  console.log('[MOCK] generate-text called with:', {
    prompt: `${postData?.prompt?.slice(0, 50)}...`,
  });

  await route.fulfill({
    body: mockEnhancedText,
    contentType: 'text/plain',
    status: 200,
  });
}

/**
 * Handler for error scenarios
 *
 * Use this to test error handling in your application.
 */
export async function handleGenerateVoiceError(
  route: Route,
  errorMessage = 'Voice generation failed, please retry',
  statusCode = 500,
) {
  console.log(
    '[MOCK] generate-voice ERROR handler called - returning',
    statusCode,
    errorMessage,
  );
  await route.fulfill({
    body: JSON.stringify({ error: errorMessage }),
    contentType: 'application/json',
    status: statusCode,
  });
}

/**
 * Handler for insufficient credits error
 */
export async function handleInsufficientCreditsError(route: Route) {
  await route.fulfill({
    body: JSON.stringify({
      error: 'Not enough credits',
      errorCode: 'INSUFFICIENT_CREDITS',
    }),
    contentType: 'application/json',
    status: 402,
  });
}

/**
 * Setup all default mocks
 *
 * Convenience function to setup all common mocks at once.
 *
 * Usage in tests:
 * await setupDefaultMocks(page);
 */
export async function setupDefaultMocks(page: Page) {
  await page.route('**/api/generate-voice', handleGenerateVoice);
  await page.route('**/api/estimate-credits', handleEstimateCredits);
  await page.route('**/api/generate-text', handleGenerateText);
}
