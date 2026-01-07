import type { Route } from '@playwright/test';

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
 * Mock base64-encoded WAV audio data
 * This is a minimal valid WAV file header that matches the vitest mock
 */
export const mockAudioData =
  'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

/**
 * Mock response for generate-voice API
 * Matches the structure: { url, creditsUsed, creditsRemaining }
 */
export const mockGenerateVoiceResponse = {
  url: 'https://files.sexyvoice.ai/generated-audio-free/test-audio-e2e.wav',
  creditsUsed: 12,
  creditsRemaining: 988,
};

/**
 * Mock response for estimate-credits API
 * Matches the structure: { tokens, estimatedCredits }
 */
export const mockEstimateCreditsResponse = {
  tokens: 150,
  estimatedCredits: 15,
};

/**
 * Mock enhanced text response (with emotion tags)
 * This simulates the AI text enhancement feature
 */
export const mockEnhancedText = '<happy>Enhanced text with emotion tags</happy>';

/**
 * Handler for POST /api/generate-voice
 *
 * Mocks the Google Gemini voice generation API call.
 * Returns a successful response with audio URL and credit info.
 */
export async function handleGenerateVoice(route: Route) {
  const request = route.request();
  const postData = request.postDataJSON();

  // Log for debugging
  console.log('[MOCK] generate-voice called with:', {
    text: postData?.text?.substring(0, 50) + '...',
    voice: postData?.voice,
  });

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Fulfill with mock response
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(mockGenerateVoiceResponse),
  });
}

/**
 * Handler for POST /api/estimate-credits
 *
 * Mocks the Google token counting API for credit estimation.
 */
export async function handleEstimateCredits(route: Route) {
  const request = route.request();
  const postData = request.postDataJSON();

  console.log('[MOCK] estimate-credits called with:', {
    text: postData?.text?.substring(0, 50) + '...',
    voice: postData?.voice,
  });

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(mockEstimateCreditsResponse),
  });
}

/**
 * Handler for POST /api/generate-text
 *
 * Mocks the AI text enhancement (adds emotion tags).
 * Returns a simple text response (not streamed for simplicity).
 */
export async function handleGenerateText(route: Route) {
  const request = route.request();
  const postData = request.postDataJSON();

  console.log('[MOCK] generate-text called with:', {
    prompt: postData?.prompt?.substring(0, 50) + '...',
  });

  await route.fulfill({
    status: 200,
    contentType: 'text/plain',
    body: mockEnhancedText,
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
  statusCode = 500
) {
  await route.fulfill({
    status: statusCode,
    contentType: 'application/json',
    body: JSON.stringify({ error: errorMessage }),
  });
}

/**
 * Handler for insufficient credits error
 */
export async function handleInsufficientCreditsError(route: Route) {
  await route.fulfill({
    status: 402,
    contentType: 'application/json',
    body: JSON.stringify({
      error: 'Not enough credits',
      errorCode: 'INSUFFICIENT_CREDITS',
    }),
  });
}

/**
 * Handler for Google API quota exceeded error
 */
export async function handleQuotaExceededError(route: Route) {
  await route.fulfill({
    status: 429,
    contentType: 'application/json',
    body: JSON.stringify({
      error: 'You exceeded your current quota',
      errorCode: 'THIRD_P_QUOTA_EXCEEDED',
    }),
  });
}

/**
 * Handler for prohibited content error
 */
export async function handleProhibitedContentError(route: Route) {
  await route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({
      error: 'Content was flagged as potentially harmful',
      errorCode: 'PROHIBITED_CONTENT',
    }),
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
export async function setupDefaultMocks(page: any) {
  await page.route('**/api/generate-voice', handleGenerateVoice);
  await page.route('**/api/estimate-credits', handleEstimateCredits);
  await page.route('**/api/generate-text', handleGenerateText);
}
