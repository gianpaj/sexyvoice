import { expect, test } from '@playwright/test';

const RESULT = '[data-testid="demo-clone-result"]';

test.describe('Hear the difference', () => {
  test('offers two voices and three prepared takes immediately', async ({
    page,
  }) => {
    await page.goto('/en/voice-cloning');
    await expect(
      page.getByRole('heading', { name: 'Hear the difference' }),
    ).toBeVisible();
    await expect(page.locator('input[name="demo-clone-speaker"]')).toHaveCount(
      2,
    );
    await expect(page.locator('input[name="demo-clone-take"]')).toHaveCount(3);
    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-take-id',
      'natural',
    );
    await expect(page.locator('audio')).toHaveJSProperty('paused', true);
  });

  test('plays all six local clips and stops when changing selection', async ({
    page,
  }) => {
    const generationRequests: string[] = [];
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        /clone-voice|audio\/speech/.test(request.url())
      )
        generationRequests.push(request.url());
    });
    await page.goto('/en/voice-cloning');
    for (const speaker of ['kat', 'heike']) {
      await page.getByTestId(`demo-clone-speaker-${speaker}`).click();
      await page
        .locator('input[name="demo-clone-take"][value="natural"]')
        .check({ force: true });
      const quote = page.getByTestId('demo-clone-script');
      const sentence = await quote.textContent();
      for (const [take, tags] of [
        ['natural', ''],
        ['sarcastic', '[emotion=sarcastic]'],
        ['calmSlow', '[emotion=calm][pace=slow]'],
      ]) {
        await page
          .locator(`input[name="demo-clone-take"][value="${take}"]`)
          .check({ force: true });
        await expect(page.locator('audio')).toHaveJSProperty('paused', true);
        await expect(page.locator('audio')).toHaveAttribute(
          'src',
          `/demo-clones/voxtral-3/${speaker}-${take}.mp3`,
        );
        await expect(quote).toBeVisible();
        if (tags) await expect(quote).toContainText(tags);
        else await expect(quote).not.toContainText('[');
        expect((await quote.textContent())?.replace(/\[[^\]]*\]\s*/g, '')).toBe(
          sentence,
        );
        await page.getByTestId('demo-clone-play').click();
        await expect(page.locator('audio')).toHaveJSProperty('paused', false);
        await expect
          .poll(() =>
            page
              .locator('audio')
              .evaluate((audio: HTMLAudioElement) => audio.currentTime),
          )
          .toBeGreaterThan(0);
      }
    }
    expect(generationRequests).toEqual([]);
  });

  test('uses one player for the original recording and selected clone', async ({
    page,
  }) => {
    await page.goto('/en/voice-cloning');
    await page.getByText('Calm & slow', { exact: true }).click();
    await page.getByRole('button', { name: 'Hear the original' }).click();
    await expect(page.locator('audio')).toHaveCount(1);
    await expect(page.locator('audio')).toHaveAttribute(
      'src',
      '/demo-clones/voxtral-3/kat-reference.mp3',
    );
    await expect(page.locator('audio')).toHaveJSProperty('paused', false);
    await page.getByRole('button', { name: 'Back to the clone' }).click();
    await expect(page.locator('audio')).toHaveAttribute(
      'src',
      '/demo-clones/voxtral-3/kat-calmSlow.mp3',
    );
  });

  test('shows tags inline without a disclosure and carries the selected take through login and signup', async ({
    page,
  }) => {
    await page.goto('/en/voice-cloning');
    await page.getByTestId('demo-clone-speaker-heike').click();
    await page.getByText('Calm & slow', { exact: true }).click();
    await expect(page.getByTestId('demo-clone-script')).toBeVisible();
    await expect(page.getByTestId('demo-clone-script')).toContainText(
      '[emotion=calm][pace=slow]',
    );
    const player = page.getByTestId('demo-clone-result').locator('..');
    await expect(player.locator('details, summary')).toHaveCount(0);
    await expect(page.getByTestId('demo-clone-prompt')).toHaveCount(0);
    await page.getByTestId('demo-clone-try').click();
    await expect(page).toHaveURL(/\/en\/login\?redirect_to=/);
    expect(new URL(page.url()).searchParams.get('redirect_to')).toBe(
      '/en/dashboard/clone?demo=heike&take=calmSlow',
    );
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Sign up', exact: true })
      .click();
    await expect(page).toHaveURL(/\/en\/signup\?redirect_to=/);
    expect(new URL(page.url()).searchParams.get('redirect_to')).toBe(
      '/en/dashboard/clone?demo=heike&take=calmSlow',
    );
  });

  test('preselects German for German visitors and English for uncovered locales', async ({
    page,
  }) => {
    for (const [locale, speaker] of [
      ['de', 'heike'],
      ['fr', 'kat'],
    ]) {
      await page.goto(`/${locale}/voice-cloning`);
      await expect(
        page.locator(`input[name="demo-clone-speaker"][value="${speaker}"]`),
      ).toBeChecked();
    }
  });

  test('fits a mobile screen and supports keyboard selection', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/voice-cloning');
    const natural = page.locator(
      'input[name="demo-clone-take"][value="natural"]',
    );
    await natural.focus();
    await page.keyboard.press('ArrowRight');
    await expect(
      page.locator('input[name="demo-clone-take"][value="sarcastic"]'),
    ).toBeChecked();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
});
