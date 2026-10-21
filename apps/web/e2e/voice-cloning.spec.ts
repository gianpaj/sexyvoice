import { expect, test } from '@playwright/test';

const RESULT = '[data-testid="demo-clone-result"]';
const sameOriginalPrompt =
  'Downtown Drugstore had a bell on the door that made a single tink sound when you opened it.\nOxford Pharmacy had two bells on its doors, so it was more of a ta-tank, though nothing to startle over.';

test.describe('Hear the difference', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('offers four takes for Kat and three for Heike with Natural selected', async ({
    page,
  }) => {
    await page.goto('/en/voice-cloning');
    await expect(
      page.getByRole('heading', { name: 'Hear the difference' }),
    ).toBeVisible();
    await expect(page.locator('input[name="demo-clone-speaker"]')).toHaveCount(
      2,
    );
    const takes = page.locator('input[name="demo-clone-take"]');
    await expect(takes).toHaveCount(4);
    await expect(takes.first()).toHaveValue('sameOriginal');
    await expect(
      page.getByRole('radio', { name: 'Same as original' }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('radio', { name: 'Natural', exact: true }),
    ).toBeChecked();
    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-take-id',
      'natural',
    );
    await expect(page.locator('audio')).toHaveJSProperty('paused', true);
    await expect(
      page.getByRole('link', { name: 'Sign up and Clone', exact: true }),
    ).toBeVisible();
    await page.getByTestId('demo-clone-speaker-heike').click();
    await expect(takes).toHaveCount(3);
    await expect(
      page.getByRole('radio', { name: 'Same as original' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('radio', { name: 'Natural', exact: true }),
    ).toBeChecked();
  });

  test('plays Kat’s full reference passage and resets an unsupported take for Heike', async ({
    page,
  }) => {
    await page.goto('/en/voice-cloning');
    await page
      .getByRole('radio', { name: 'Same as original' })
      .check({ force: true });
    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-take-id',
      'sameOriginal',
    );
    const prompt = page.getByTestId('demo-clone-prompt-text');
    await expect(prompt).toHaveClass(/\bselect-all\b/);
    expect(await prompt.textContent()).toBe(sameOriginalPrompt);
    await expect(page.locator('audio')).toHaveAttribute(
      'src',
      '/demo-clones/voxtral-3/kat-sameOriginal.mp3',
    );
    await expect(page.getByTestId('demo-clone-try')).toHaveAttribute(
      'href',
      '/en/dashboard/clone?demo=kat&take=sameOriginal',
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
    await page.getByRole('button', { name: 'Hear the original' }).click();
    await expect(page.locator('audio')).toHaveAttribute(
      'src',
      '/demo-clones/voxtral-3/kat-reference.mp3',
    );
    await page.getByRole('button', { name: 'Back to the clone' }).click();
    await expect(page.locator('audio')).toHaveAttribute(
      'src',
      '/demo-clones/voxtral-3/kat-sameOriginal.mp3',
    );
    await page.getByTestId('demo-clone-speaker-heike').click();
    await expect(page.locator(RESULT)).toHaveAttribute(
      'data-take-id',
      'natural',
    );
    await expect(
      page.getByRole('radio', { name: 'Same as original' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('radio', { name: 'Natural', exact: true }),
    ).toBeChecked();
    await expect(page.locator('audio')).toHaveAttribute(
      'src',
      '/demo-clones/voxtral-3/heike-natural.mp3',
    );
    await expect(page.locator('audio')).toHaveJSProperty('paused', true);
    await page.getByTestId('demo-clone-speaker-kat').click();
    await expect(
      page.getByRole('radio', { name: 'Natural', exact: true }),
    ).toBeChecked();
  });

  test('carries the exact Same as original take through login and signup', async ({
    page,
  }) => {
    await page.goto('/en/voice-cloning');
    await page
      .getByRole('radio', { name: 'Same as original' })
      .check({ force: true });
    await page.getByTestId('demo-clone-try').click();
    await expect(page).toHaveURL(/\/en\/login\?redirect_to=/);
    expect(new URL(page.url()).searchParams.get('redirect_to')).toBe(
      '/en/dashboard/clone?demo=kat&take=sameOriginal',
    );
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Sign up', exact: true })
      .click();
    await expect(page).toHaveURL(/\/en\/signup\?redirect_to=/);
    expect(new URL(page.url()).searchParams.get('redirect_to')).toBe(
      '/en/dashboard/clone?demo=kat&take=sameOriginal',
    );
  });

  test('plays the six existing delivery clips and preserves each speaker’s sentence', async ({
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
    await page.keyboard.press('ArrowLeft');
    await expect(
      page.getByRole('radio', { name: 'Same as original' }),
    ).toBeChecked();
    await expect(page.getByTestId('demo-clone-prompt-text')).toHaveText(
      sameOriginalPrompt,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.keyboard.press('ArrowRight');
    await expect(natural).toBeChecked();
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
