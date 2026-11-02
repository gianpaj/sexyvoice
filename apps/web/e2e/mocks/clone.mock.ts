import type { Route } from '@playwright/test';

/**
 * Clone Dashboard Mock Handlers
 *
 * These handlers mock the /api/clone-voice endpoint responses
 * for predictable E2E testing of the voice cloning dashboard.
 */

/**
 * Mock response for a successful voice clone
 */
export const mockCloneVoiceResponse = {
  creditsRemaining: 950,
  creditsUsed: 50,
  url: 'https://files.sexyvoice.ai/cloned-voices/test-cloned-voice-e2e.wav',
  voiceId: 'test-voice-id-e2e',
};

/**
 * Handler for POST /api/clone-voice — successful clone
 *
 * Mocks the voice cloning API call.
 * Returns a successful response with audio URL and credit info.
 */
export async function handleCloneVoice(route: Route) {
  const request = route.request();

  console.log('[MOCK] clone-voice called', {
    contentType: request.headers()['content-type']?.slice(0, 50),
    method: request.method(),
  });

  // Simulate processing delay
  await new Promise((resolve) => setTimeout(resolve, 800));

  await route.fulfill({
    body: JSON.stringify(mockCloneVoiceResponse),
    contentType: 'application/json',
    status: 200,
  });
}

/**
 * Handler for POST /api/clone-voice — server error
 */
export async function handleCloneVoiceError(
  route: Route,
  errorMessage = 'Voice cloning failed, please retry',
  statusCode = 500,
) {
  console.log(
    '[MOCK] clone-voice ERROR handler called - returning',
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
 * Handler for POST /api/clone-voice — insufficient credits
 */
export async function handleCloneVoiceInsufficientCredits(route: Route) {
  console.log('[MOCK] clone-voice INSUFFICIENT CREDITS handler called');

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
 * Setup default clone mocks
 *
 * Convenience function to set up all clone-related mocks at once.
 */
export async function setupCloneMocks(page: {
  route: (
    url: string,
    handler: (route: Route) => Promise<void>,
  ) => Promise<void>;
}) {
  await page.route('**/api/clone-voice', handleCloneVoice);
}
