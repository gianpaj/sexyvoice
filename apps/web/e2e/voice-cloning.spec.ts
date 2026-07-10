import { expect, test } from '@playwright/test';

/**
 * The demo widget resolves every selection to a prepared clip; nothing is
 * generated. These tests assert on `data-clip-key` rather than on playback, so
 * they stay valid whether or not the R2 audio objects exist yet.
 */

const RESULT = '[data-testid="demo-clone-result"]';

test.describe('Voice cloning demo landing page', () => {
  test('is reachable logged out and reveals the prepared clip', async ({
    page,
  }) => {
    await page.goto('/en/voice-cloning');

    // The result only exists once revealed.
    await expect(page.locator(RESULT)).toHaveCount(0);

    await page.getByTestId('demo-clone-reveal').click();

    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-clip-key',
      'ava:en:greeting',
    );
  });

  test('swaps the clip when the selection changes', async ({ page }) => {
    await page.goto('/en/voice-cloning');
    await page.getByTestId('demo-clone-reveal').click();

    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-clip-key',
      'ava:en:greeting',
    );

    await page.getByTestId('demo-clone-language-es').click();
    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-clip-key',
      'ava:es:greeting',
    );

    await page.getByTestId('demo-clone-speaker-leo').click();
    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-clip-key',
      'leo:es:greeting',
    );

    await page.getByTestId('demo-clone-sentence-invitation').click();
    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-clip-key',
      'leo:es:invitation',
    );
  });

  test('keeps the reveal button until it is pressed', async ({ page }) => {
    await page.goto('/en/voice-cloning');

    const reveal = page.getByTestId('demo-clone-reveal');
    await expect(reveal).toBeVisible();

    await page.getByTestId('demo-clone-language-it').click();
    await expect(reveal).toBeVisible();

    await reveal.click();
    await expect(reveal).toHaveCount(0);
    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-clip-key',
      'ava:it:greeting',
    );
  });

  test('pre-selects the page locale when the demo covers it', async ({
    page,
  }) => {
    await page.goto('/it/voice-cloning');

    await expect(
      page.locator('input[name="demo-clone-language"][value="it"]'),
    ).toBeChecked();

    await page.getByTestId('demo-clone-reveal').click();
    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-clip-key',
      'ava:it:greeting',
    );
  });

  test('falls back to English for a locale the demo does not cover', async ({
    page,
  }) => {
    await page.goto('/de/voice-cloning');

    await expect(
      page.locator('input[name="demo-clone-language"][value="en"]'),
    ).toBeChecked();
  });

  test('never offers to generate or upload', async ({ page }) => {
    await page.goto('/en/voice-cloning');

    // Honesty constraints from the design doc: no upload control, and the CTA
    // must not imply the visitor's selections produced the audio.
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(page.getByTestId('demo-clone-reveal')).toHaveText(
      'Hear the result',
    );
    await expect(
      page.getByText('Prepared examples. Sign up to clone your own voice.'),
    ).toBeVisible();
  });
});
