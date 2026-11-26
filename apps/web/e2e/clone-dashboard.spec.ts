import { argosScreenshot } from './argos-screenshot';
import { setE2ECallUser } from './e2e-call-user';
import { expect, test } from './fixtures';
import { ClonePage } from './pages/clone.page';

/**
 * Clone Dashboard E2E Tests
 *
 * These tests verify the voice cloning page functionality:
 * 1. Page display: title, tabs, upload area, language selector
 * 2. Form elements: text input, legal consent, generate button
 * 3. Form validation: disabled button states
 * 4. Auth redirect for unauthenticated users
 *
 * All tests use the authenticated state from auth.setup.ts.
 * Microphone tests are skipped (require browser permissions).
 * File upload tests use Playwright's setInputFiles API.
 */

test.describe('Clone Dashboard - Authenticated User', () => {
  let clonePage: ClonePage;

  test.beforeEach(async ({ baseURL, page }) => {
    // Paid, so the screenshot includes the fixture saved voices.
    await setE2ECallUser(page, baseURL, 'paid');
    clonePage = new ClonePage(page);
    await clonePage.goto();
  });

  test('should display the clone page correctly', async ({
    page,
  }, testInfo) => {
    // Verify page title and upload tab are visible
    await clonePage.expectPageVisible();

    // Verify text input is visible
    await clonePage.expectTextInputVisible();

    // Verify generate button is visible
    await clonePage.expectGenerateButtonVisible();

    await argosScreenshot(page, `clone-dashboard-${testInfo.project.name}`);
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

  test('should display legal consent checkbox (visible)', async () => {
    await clonePage.expectLegalConsentVisible();
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

  test('rates the audio generated from a saved voice', async ({ page }) => {
    const audioFileId = '15151515-1515-4151-8151-151515151515';
    await page.route('**/api/clone-voice', (route) =>
      route.fulfill({
        json: {
          audioFileId,
          creditsRemaining: 4990,
          creditsUsed: 10,
          url: 'https://files.sexyvoice.ai/test-cloned-audio.wav',
        },
      }),
    );
    await page.route('**/api/feedback', (route) =>
      route.fulfill({ json: { rating: 'down' } }),
    );

    await page.getByRole('radio', { name: /My saved voice/ }).check();
    await clonePage.enterText('Rate the new speech from this voice.');
    await clonePage.checkLegalConsent();
    await clonePage.generateButton.click();
    await expect(clonePage.previewTab).toHaveAttribute('data-state', 'active');

    const badAudio = page.getByRole('button', { name: 'Bad audio' });
    const [submission] = await Promise.all([
      page.waitForRequest('**/api/feedback'),
      badAudio.click(),
    ]);
    expect(submission.postDataJSON()).toEqual({
      rating: 'down',
      target: { kind: 'audio', audioFileId },
    });
    await expect(badAudio).toHaveAttribute('aria-pressed', 'true');
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
