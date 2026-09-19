import { expect, test } from '@playwright/test';

/**
 * Each speaker owns its prepared clip; nothing is generated. These tests assert
 * on `data-speaker-id` rather than on playback, so they stay valid whether or
 * not the R2 audio objects exist yet.
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
      'data-speaker-id',
      'kat',
    );
  });

  test('swaps the clip and the script when the speaker changes', async ({
    page,
  }) => {
    await page.goto('/en/voice-cloning');
    await page.getByTestId('demo-clone-reveal').click();

    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-speaker-id',
      'kat',
    );
    await expect(page.getByTestId('demo-clone-script')).toContainText(
      'Downtown Drugstore',
    );

    await page.getByTestId('demo-clone-speaker-heike').click();

    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-speaker-id',
      'heike',
    );
    await expect(page.getByTestId('demo-clone-script')).toContainText(
      'Der Kasse gleich rechts',
    );
  });

  test('keeps the reveal button until it is pressed', async ({ page }) => {
    await page.goto('/en/voice-cloning');

    const reveal = page.getByTestId('demo-clone-reveal');
    await expect(reveal).toBeVisible();

    await page.getByTestId('demo-clone-speaker-heike').click();
    await expect(reveal).toBeVisible();

    await reveal.click();
    await expect(reveal).toHaveCount(0);
    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-speaker-id',
      'heike',
    );
  });

  test('pre-selects the speaker whose language the page locale matches', async ({
    page,
  }) => {
    await page.goto('/de/voice-cloning');

    await expect(
      page.locator('input[name="demo-clone-speaker"][value="heike"]'),
    ).toBeChecked();
  });

  test('falls back to the English speaker for an uncovered locale', async ({
    page,
  }) => {
    await page.goto('/fr/voice-cloning');

    await expect(
      page.locator('input[name="demo-clone-speaker"][value="kat"]'),
    ).toBeChecked();
  });

  test('never shows the raw TTS directives', async ({ page }) => {
    await page.goto('/en/voice-cloning');

    await expect(page.getByTestId('demo-clone-script')).not.toContainText('[');
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
