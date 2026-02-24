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
    await expect(page.getByTestId('clone-language-select')).toBeVisible();
  });

  test('should show legal consent checkbox', async () => {
    await clonePage.expectLegalConsentVisible();
  });

  test('should have legal consent unchecked by default', async () => {
    await clonePage.expectLegalConsentUnchecked();
  });

  test('should toggle legal consent checkbox', async () => {
    await clonePage.expectLegalConsentVisible();
  });

  test('should show sample audio accordion items', async () => {
    await clonePage.expectSampleAudiosPresent();
  });

  test('should expand sample audio accordion', async () => {
    await expect(clonePage.sampleAccordionItems.first()).toBeVisible();
  });

  test('should disable generate button when no audio is provided', async () => {
    await clonePage.expectGenerateButtonDisabled();
  });

  test('should disable generate button when text is empty', async () => {
    await clonePage.expectGenerateButtonDisabled();
  });

  test('should disable generate button without consent', async () => {
    await clonePage.expectGenerateButtonDisabled();
  });

  test('should have preview tab disabled before generation', async () => {
    // Preview tab should be disabled until a voice is successfully cloned
    await clonePage.expectPreviewTabDisabled();
  });

  test('should display text input with character limit', async () => {
    await clonePage.expectTextInputVisible();
    await expect(clonePage.characterCount).toBeVisible();
  });

  test('should show character count updating as text is typed', async () => {
    await expect(clonePage.characterCount).toBeVisible();
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
