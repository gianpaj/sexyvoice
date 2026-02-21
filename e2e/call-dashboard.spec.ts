import { expect, test } from '@playwright/test';

import { CallPage } from './pages/call.page';

/**
 * Call Dashboard E2E Tests
 *
 * These tests verify the real-time AI voice call page functionality:
 * 1. Configuration form display (language selector, character presets)
 * 2. Connect button presence
 * 3. Notice text at the bottom of the page
 * 4. Auth redirect for unauthenticated users
 *
 * All tests use the authenticated state from auth.setup.ts.
 * We do NOT actually connect to LiveKit — tests focus on UI presence only.
 */

test.describe('Call Dashboard - Authenticated User', () => {
  let callPage: CallPage;

  test.beforeEach(async ({ page }) => {
    // Mock the call-token endpoint to prevent real LiveKit connections
    await page.route('**/api/call-token', async (route) => {
      console.log('[MOCK] call-token intercepted — not connecting to LiveKit');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'mock-token-for-e2e',
          url: 'wss://mock-livekit.example.com',
        }),
      });
    });

    callPage = new CallPage(page);
    await callPage.goto();
  });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/*');
  });

  test('should display the call page correctly', async () => {
    // Verify configuration form is visible
    await callPage.expectPageVisible();
    await callPage.expectConfigurationFormVisible();
  });

  test('should display language selector', async () => {
    await callPage.expectLanguageSelectorVisible();
  });

  test('should display language selector with multiple options', async () => {
    await callPage.expectLanguageSelectorHasOptions();
  });

  test('should display connect/call button', async () => {
    await callPage.expectConnectButtonVisible();
  });

  test('should display notice text', async () => {
    await callPage.expectNoticeTextVisible();
  });

  test('should display configuration form with form element', async () => {
    await callPage.expectFormPresent();
  });

  test('should display character/preset content area', async () => {
    await callPage.expectCharacterContentPresent();
  });

  test('should have connect button enabled', async () => {
    await callPage.expectConnectButtonEnabled();
  });
});

test.describe('Call Dashboard - Mobile Viewport', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  let callPage: CallPage;

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/call-token', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accessToken: 'mock-token-for-e2e',
          url: 'wss://mock-livekit.example.com',
        }),
      });
    });

    callPage = new CallPage(page);
    await callPage.goto();
  });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/*');
  });

  test('should display credits section on mobile', async () => {
    await callPage.expectCreditsSectionVisible();
  });
});

test.describe('Call Dashboard - Unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/en/dashboard/call');

    // Should be redirected to login
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
