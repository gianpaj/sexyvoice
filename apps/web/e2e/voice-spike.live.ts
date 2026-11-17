import { expect, test } from '@playwright/test';

// Explicit config only: this test uses real providers and an allowlisted account.
test('connects, receives audio, exchanges text, mutes and hangs up', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/en/dashboard/voice-spike');
  await expect(
    page.getByRole('heading', { name: 'JS call demo' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Start call', exact: true }).click();
  try {
    await expect(
      page.getByRole('button', { name: 'Mute microphone', exact: true }),
    ).toBeVisible({ timeout: 65_000 });
    await expect(page.getByText('In call', { exact: true })).toBeVisible();
    await page
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('Reply exactly: Browser test passed.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(
      page.getByRole('log').getByText('Browser test passed.', { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(
        () =>
          page
            .locator('audio')
            .evaluateAll((elements) =>
              elements.some(
                (element) =>
                  element.readyState >= 2 &&
                  !element.paused &&
                  element.currentTime > 0,
              ),
            ),
        { timeout: 10_000 },
      )
      .toBe(true);
    await page
      .getByRole('button', { name: 'Mute microphone', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Unmute microphone', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Unmute microphone', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Mute microphone', exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    const end = page.getByRole('button', { name: 'End call', exact: true });
    if (await end.isVisible()) await end.click();
  }
  await expect(
    page.getByRole('button', { name: 'Start call', exact: true }),
  ).toBeVisible();
});
