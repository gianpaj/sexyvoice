import type { Route } from '@playwright/test';

/**
 * Call Dashboard Mock Handlers
 *
 * These handlers mock the /api/call-token endpoint responses
 * for predictable E2E testing of the call dashboard.
 *
 * We do NOT actually connect to LiveKit — the tests focus on
 * verifying the UI elements (configuration form, character selection,
 * connect button, credits section) are rendered correctly.
 */

/**
 * Mock LiveKit access token (not a real token — just a placeholder
 * so the UI can proceed without errors when tested)
 */
export const mockCallTokenResponse = {
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-token-for-e2e-tests',
  url: 'wss://mock-livekit-server.example.com',
};

/**
 * Handler for POST /api/call-token — successful token generation
 *
 * Returns a mock LiveKit access token.
 */
export async function handleCallToken(route: Route) {
  const request = route.request();
  const postData = request.postDataJSON();

  console.log('[MOCK] call-token called with:', {
    selectedPresetId: postData?.selectedPresetId,
  });

  // Simulate a small delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(mockCallTokenResponse),
  });
}

/**
 * Handler for POST /api/call-token — insufficient credits
 */
export async function handleCallTokenInsufficientCredits(route: Route) {
  console.log('[MOCK] call-token INSUFFICIENT CREDITS handler called');

  await route.fulfill({
    status: 402,
    contentType: 'application/json',
    body: JSON.stringify({
      error: 'Not enough credits to start a call',
      errorCode: 'INSUFFICIENT_CREDITS',
    }),
  });
}

/**
 * Handler for POST /api/call-token — server error
 */
export async function handleCallTokenError(
  route: Route,
  errorMessage = 'Failed to generate call token',
  statusCode = 500,
) {
  console.log(
    '[MOCK] call-token ERROR handler called - returning',
    statusCode,
    errorMessage,
  );

  await route.fulfill({
    status: statusCode,
    contentType: 'application/json',
    body: JSON.stringify({ error: errorMessage }),
  });
}

/**
 * Setup default call mocks
 *
 * Convenience function to set up all call-related mocks at once.
 */
export async function setupCallMocks(page: {
  route: (
    url: string,
    handler: (route: Route) => Promise<void>,
  ) => Promise<void>;
}) {
  await page.route('**/api/call-token', handleCallToken);
}
