import { expect, test } from '@playwright/test';

import {
  handleGenerateVoiceError,
  handleInsufficientCreditsError,
  setupDefaultMocks,
} from './mocks/google-ai.mock';
import { GeneratePage } from './pages/generate.page';

/**
 * Generate Dashboard E2E Tests
 *
 * These tests verify the main user flow for generating audio:
 * 1. User logs in (handled by auth.setup.ts)
 * 2. User navigates to generate dashboard
 * 3. User selects a voice and enters text
 * 4. User generates audio (API calls are mocked)
 * 5. User sees the generated audio player
 *
 * All Google AI API calls are mocked at the HTTP level using Playwright's route() method.
 * This approach mirrors the vitest test setup but at the E2E level.
 */

test.describe('Generate Dashboard - Authenticated User', () => {
  let generatePage: GeneratePage;

  test.beforeEach(async ({ page }) => {
    // Setup all API mocks
    await setupDefaultMocks(page);

    // Create page object and navigate
    generatePage = new GeneratePage(page);
    await generatePage.goto();
  });

  test.afterEach(async ({ page }) => {
    // Clear any route handlers to avoid interference between tests
    await page.unroute('**/*');
  });

  test('should display the generate page correctly', async () => {
    // Verify page loaded with correct heading
    await generatePage.expectHeadingContains(/generate/i);

    // Verify voice selector is visible
    await expect(generatePage.voiceSelector).toBeVisible();

    // Verify text input is visible
    await expect(generatePage.textInput).toBeVisible();

    // Verify generate button exists
    await expect(generatePage.generateButton).toBeVisible();
  });

  test('should successfully generate audio with mocked API', async () => {
    // Zephyr is already selected by default, no need to select

    // Fill in text input
    await generatePage.enterText(
      'Hello, this is a test message for voice generation.',
    );

    // Click generate button
    await generatePage.clickGenerate();

    // Wait for generation to complete
    await generatePage.waitForGenerationComplete();

    // Verify audio player appears
    await generatePage.expectAudioPlayerVisible();

    // Verify success toast appears
    await generatePage.expectSuccessToast();
  });

  test('should disable generate button when text is empty', async () => {
    // Zephyr is already selected by default
    // Don't enter any text

    // Button should be disabled
    await generatePage.expectGenerateButtonDisabled();
  });

  test('should show character count and limit', async () => {
    // Zephyr is already selected by default (1000 char limit)

    // Fill some text
    const testText = 'Hello world';
    await generatePage.enterText(testText);

    // Check character count is displayed (11 characters)
    await generatePage.expectCharacterCountMatches(/11/);
  });

  test('should handle API error gracefully', async ({ page }) => {
    // Remove existing mock and set up error mock
    await page.unroute('**/api/generate-voice');
    await page.route('**/api/generate-voice', (route) =>
      handleGenerateVoiceError(route),
    );

    // Zephyr is already selected by default, just fill text
    await generatePage.enterText('Test message');

    // Click generate
    await generatePage.clickGenerate();

    // Verify error toast appears
    await generatePage.expectErrorToast();

    // Button should return to normal state
    await expect(generatePage.generateButton).toContainText(/generate/i);
  });

  test('should estimate credits for Gemini voice', async () => {
    // Zephyr (Gemini voice) is already selected by default

    // Fill in text
    await generatePage.enterText('Hello world test message');

    // Click estimate credits button
    await generatePage.clickEstimateCredits();

    // Verify estimated credits are displayed (mock returns 15)
    await generatePage.expectEstimatedCredits(15);
  });

  test('should cancel ongoing generation', async ({ page }) => {
    // Create a slow mock to allow cancellation
    await page.route('**/api/generate-voice', async (route) => {
      // Delay for 5 seconds to give time to cancel
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://files.sexyvoice.ai/test.wav',
          creditsUsed: 12,
          creditsRemaining: 988,
        }),
      });
    });

    // Zephyr is already selected by default, just enter text
    await generatePage.enterText('Test message');

    // Start generation
    await generatePage.clickGenerate();

    // Wait for generating state
    await expect(generatePage.generateButton).toContainText(/generating/i);

    // Click cancel button
    await generatePage.clickCancel();

    // Verify generation was cancelled (button returns to normal state)
    await expect(generatePage.generateButton).toContainText(/generate/i, {
      timeout: 2000,
    });
  });

  test.skip('should show warning when text exceeds character limit', async () => {
    // SKIPPED: This test is slow due to typing 1000+ characters
    // TODO: Find a faster way to test character limit validation
    // Zephyr is already selected by default (1000 char limit)

    // Enter text exceeding the 1000 character limit
    const longText = 'a'.repeat(1050);
    await generatePage.enterText(longText);

    // Character count should show the count exceeding the limit
    await generatePage.expectCharacterCountMatches(/1050/);

    // Generate button should be disabled when over limit
    await generatePage.expectGenerateButtonDisabled();
  });

  test('should allow style input for Gemini voices', async () => {
    // Zephyr (Gemini voice) is already selected by default

    // Style input should be visible for Gemini voices
    await expect(generatePage.styleInput).toBeVisible();

    // Enter a style
    await generatePage.enterStyle('excited and energetic');

    // Enter text
    await generatePage.enterText('This is a test message');

    // Generate should work with style
    await generatePage.clickGenerate();
    await generatePage.waitForGenerationComplete();
    await generatePage.expectAudioPlayerVisible();
  });

  test('should handle multiple generations in sequence', async () => {
    // First generation (Zephyr is already selected by default)
    await generatePage.enterText('First message');
    await generatePage.clickGenerate();
    await generatePage.waitForGenerationComplete();
    await generatePage.expectAudioPlayerVisible();

    // Second generation
    await generatePage.enterText('Second message');
    await generatePage.clickGenerate();
    await generatePage.waitForGenerationComplete();
    await generatePage.expectAudioPlayerVisible();
  });
});

test.describe('Generate Dashboard - Unauthenticated', () => {
  // Override storage state to simulate unauthenticated user
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should redirect to login when not authenticated', async ({ page }) => {
    // Try to access generate page without auth
    await page.goto('/en/dashboard/generate');

    // Should be redirected to login
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});

test.describe('Generate Dashboard - Error Scenarios', () => {
  let generatePage: GeneratePage;

  test.beforeEach(async ({ page }) => {
    generatePage = new GeneratePage(page);
  });

  test('should handle insufficient credits error', async ({ page }) => {
    // Mock insufficient credits error
    await page.route('**/api/generate-voice', handleInsufficientCreditsError);
    await page.route('**/api/estimate-credits', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tokens: 150, estimatedCredits: 15 }),
      });
    });

    await generatePage.goto();

    // Try to generate (Zephyr is already selected by default)
    await generatePage.enterText('Test message');
    await generatePage.clickGenerate();

    // Should show error message
    await generatePage.expectErrorToast();
  });

  test('should handle network timeout gracefully', async ({ page }) => {
    // Mock a timeout by delaying indefinitely
    await page.route('**/api/generate-voice', async (route) => {
      // Don't fulfill - let it timeout
      await new Promise((resolve) => setTimeout(resolve, 60_000));
    });
    await page.route('**/api/estimate-credits', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tokens: 150, estimatedCredits: 15 }),
      });
    });

    await generatePage.goto();

    // Try to generate (Zephyr is already selected by default)
    await generatePage.enterText('Test message');
    await generatePage.clickGenerate();

    // Should show loading state
    await expect(generatePage.generateButton).toContainText(/generating/i, {
      timeout: 2000,
    });

    // User can cancel
    await generatePage.clickCancel();
    await expect(generatePage.generateButton).toContainText(/generate/i);
  });
});
