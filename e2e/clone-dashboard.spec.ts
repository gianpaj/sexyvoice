import { expect, test } from '@playwright/test';

import { ClonePage } from './pages/clone.page';

/**
 * Clone Dashboard E2E Tests
 *
 * These tests verify the voice cloning page functionality:
 * 1. Page display: title, tabs, upload area, language selector
 * 2. Form elements: text input, legal consent, generate button
 * 3. Sample audio accordion cards
 * 4. Form validation: disabled button states
 * 5. Auth redirect for unauthenticated users
 *
 * All tests use the authenticated state from auth.setup.ts.
 * Microphone tests are skipped (require browser permissions).
 * File upload tests use Playwright's setInputFiles API.
 */

test.describe('Clone Dashboard - Authenticated User', () => {
  let clonePage: ClonePage;

  test.beforeEach(async ({ page }) => {
    clonePage = new ClonePage(page);
    await clonePage.goto();
  });

  test('should display the clone page correctly', async () => {
    // Verify page title and upload tab are visible
    await clonePage.expectPageVisible();

    // Verify text input is visible
    await clonePage.expectTextInputVisible();

    // Verify generate button is visible
    await clonePage.expectGenerateButtonVisible();
  });

  test('should display tabs (Upload and Preview)', async () => {
    await clonePage.expectTabsVisible();
  });

  test('should show upload dropzone area', async () => {
    await clonePage.expectUploadDropzoneVisible();
  });

  test('should display language selector', async () => {
    await clonePage.expectLanguageSelectorVisible();
  });

  test('should display language selector with options', async ({ page }) => {
    // Open the language selector
    await clonePage.languageSelector.click();

    // Verify multiple language options are available
    const options = page.getByRole('option');
    const count = await options.count();
    expect(count).toBeGreaterThan(1);

    // Verify English is among the options
    await expect(page.getByRole('option', { name: /english/i })).toBeVisible();

    // Close the dropdown
    await page.keyboard.press('Escape');
  });

  test('should show legal consent checkbox', async () => {
    await clonePage.expectLegalConsentVisible();
  });

  test('should have legal consent unchecked by default', async () => {
    await clonePage.expectLegalConsentUnchecked();
  });

  test('should toggle legal consent checkbox', async () => {
    // Initially unchecked
    await clonePage.expectLegalConsentUnchecked();

    // Check it
    await clonePage.checkLegalConsent();
    await clonePage.expectLegalConsentChecked();

    // Uncheck it
    await clonePage.uncheckLegalConsent();
    await clonePage.expectLegalConsentUnchecked();
  });

  test('should show sample audio accordion items', async () => {
    await clonePage.expectSampleAudiosPresent();
  });

  test('should expand sample audio accordion', async () => {
    // Get the first accordion item and click it
    const firstItem = clonePage.sampleAccordionItems.first();
    const itemText = await firstItem.textContent();

    if (itemText) {
      await firstItem.click();

      // Verify expanded content shows source audio and example output sections
      await clonePage.expectSampleAudioExpanded();
    }
  });

  test('should disable generate button when no audio is provided', async () => {
    // Without uploading audio, just enter text and check consent
    await clonePage.enterText('Hello, this is a test message.');
    await clonePage.checkLegalConsent();

    // Button should still be disabled because no audio file is provided
    await clonePage.expectGenerateButtonDisabled();
  });

  test('should disable generate button when text is empty', async () => {
    // Even with consent checked, no text means disabled
    await clonePage.checkLegalConsent();

    // Button should be disabled
    await clonePage.expectGenerateButtonDisabled();
  });

  test('should disable generate button without consent', async () => {
    // Enter text but don't check consent
    await clonePage.enterText('Hello, this is a test message.');

    // Button should be disabled without consent
    await clonePage.expectGenerateButtonDisabled();
  });

  test('should have preview tab disabled before generation', async () => {
    // Preview tab should be disabled until a voice is successfully cloned
    await clonePage.expectPreviewTabDisabled();
  });

  test('should display text input with character limit', async () => {
    await clonePage.expectTextInputVisible();

    // Enter some text
    await clonePage.enterText('Hello world');

    // Character count should update (showing "11 / 500")
    await clonePage.expectCharacterCount(/11\s*\/\s*500/);
  });

  test('should show character count updating as text is typed', async () => {
    const testText = 'Test voice cloning message';
    await clonePage.enterText(testText);

    // Verify character count matches the text length
    await clonePage.expectCharacterCount(
      new RegExp(`${testText.length}\\s*\\/\\s*500`),
    );
  });
});

test.describe('Clone Dashboard - Unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/en/dashboard/clone');

    // Should be redirected to login
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
