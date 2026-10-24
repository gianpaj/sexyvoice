import type { Page } from '@playwright/test';

import type { ApiCharacterResponse } from '@/lib/characters';
import { E2E_CALL_USER_COOKIE } from '@/lib/e2e-mocks-shared';
import de from '@/messages/de.json';
import en from '@/messages/en.json';
import { argosScreenshot } from './argos-screenshot';
import { expect, test } from './fixtures';
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
 * Character writes and call tokens are mocked; tests never connect to LiveKit.
 */

async function setupCallPage(
  page: Page,
  baseURL: string | undefined,
  user: 'free' | 'paid' = 'free',
  locale: 'en' | 'de' = 'en',
) {
  if (!baseURL) {
    throw new Error('Call dashboard tests require a Playwright baseURL');
  }
  await page.context().addCookies([
    {
      name: E2E_CALL_USER_COOKIE,
      url: new URL('/', baseURL).href,
      value: user,
    },
  ]);
  // Mock the call-token endpoint to prevent real LiveKit connections
  await page.route('**/api/call-token', async (route) => {
    console.log('[MOCK] call-token intercepted — not connecting to LiveKit');
    await route.fulfill({
      body: JSON.stringify({
        accessToken: 'mock-token-for-e2e',
        url: 'wss://mock-livekit.example.com',
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  const placeholderSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
        <rect width="128" height="128" fill="#27272a" />
        <circle cx="64" cy="48" r="24" fill="#71717a" />
        <rect x="28" y="82" width="72" height="22" rx="11" fill="#71717a" />
      </svg>
    `;

  await page.route('**/characters/*', async (route) => {
    await route.fulfill({
      body: placeholderSvg,
      contentType: 'image/svg+xml',
      status: 200,
    });
  });

  await page.route('**/_next/image*', async (route) => {
    const url = new URL(route.request().url());
    const imageUrl = url.searchParams.get('url');

    if (imageUrl?.startsWith('/characters/')) {
      await route.fulfill({
        body: placeholderSvg,
        contentType: 'image/svg+xml',
        status: 200,
      });
      return;
    }

    await route.continue();
  });

  const callPage = new CallPage(page);
  await callPage.goto(locale);
  return callPage;
}

test.describe('Call Dashboard - Authenticated User', () => {
  let callPage: CallPage;

  test.beforeEach(async ({ page, baseURL }) => {
    callPage = await setupCallPage(page, baseURL);
  });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/*');
  });

  test('should display the call page correctly', async ({ page }, testInfo) => {
    // Verify configuration form is visible
    await callPage.expectPageVisible();
    await callPage.expectConfigurationFormVisible();
    await callPage.expectFixtureCharacters();
    await argosScreenshot(
      page,
      `call-dashboard-desktop-${testInfo.project.name}`,
    );
    await callPage.expectSceneOptionsEnabled(false);
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

  test('should display the FAQ section when disconnected', async () => {
    await callPage.expectCallFaqVisible();
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
  test.use({ viewport: { height: 812, width: 375 } });

  let callPage: CallPage;

  test.beforeEach(async ({ page, baseURL }) => {
    callPage = await setupCallPage(page, baseURL);
  });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/*');
  });

  test('should display credits section on mobile', async ({
    page,
  }, testInfo) => {
    await callPage.expectCreditsSectionVisible();
    await callPage.expectFixtureCharacters();
    await argosScreenshot(
      page,
      `call-dashboard-mobile-${testInfo.project.name}`,
    );
    await callPage.expectSceneOptionsEnabled(false);
  });
});

for (const viewport of ['desktop', 'mobile'] as const) {
  test.describe(`Call Dashboard - Paid User - ${viewport}`, () => {
    if (viewport === 'mobile') {
      test.use({ viewport: { height: 812, width: 375 } });
    }

    test.afterEach(async ({ page }) => {
      await page.unroute('**/*');
    });

    test('should display the paid call page correctly', async ({
      page,
      baseURL,
    }, testInfo) => {
      const callPage = await setupCallPage(page, baseURL, 'paid');
      await callPage.expectPageVisible();
      await callPage.expectConfigurationFormVisible();
      if (viewport === 'mobile') {
        await callPage.expectCreditsSectionVisible();
      }
      await callPage.expectFixtureCharacters();
      await argosScreenshot(
        page,
        `call-dashboard-paid-${viewport}-${testInfo.project.name}`,
      );
      await callPage.expectSceneOptionsEnabled(true);
    });
  });
}

for (const locale of ['en', 'de'] as const) {
  test(`should save a new character copy and update it in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    const labels = (locale === 'de' ? de : en).call;
    const characters = new Map<string, ApiCharacterResponse>();

    // Keep writes in this browser test. An ID denotes an update, so the mock
    // must not treat an empty or unknown ID as a successful creation.
    await page.route('**/api/characters', async (route) => {
      const body = route.request().postDataJSON();
      if (body.id !== undefined && !characters.has(body.id)) {
        await route.fulfill({
          json: { error: 'Invalid character ID' },
          status: 400,
        });
        return;
      }
      const character: ApiCharacterResponse = {
        id: body.id ?? crypto.randomUUID(),
        is_public: false,
        localized_descriptions: body.localizedDescriptions,
        name: body.name,
        prompts: {
          localized_prompts: body.localizedPrompts,
          prompt: body.prompt,
        },
        session_config: body.sessionConfig,
        voices: { name: body.voiceName },
      };
      characters.set(character.id, character);
      await route.fulfill({
        json: character,
        status: body.id === undefined ? 201 : 200,
      });
    });

    const callPage = await setupCallPage(page, baseURL, 'paid', locale);
    const originalName = 'Original story';
    const copyName = 'Copied story';
    const originalPrompt = 'You are a friendly guide to the night sky.';
    const copiedPrompt = 'You are a friendly guide to the ocean.';
    const updatedPrompt = 'You are a friendly guide to the mountains.';

    await page
      .getByRole('tab', { name: labels.custom.custom, exact: true })
      .click();
    await page
      .getByRole('button', { name: labels.custom.personality, exact: false })
      .click();
    const createForm = page.getByTestId('custom-character-form');
    await createForm
      .getByLabel(labels.createCharacter.nameLabel)
      .fill(originalName);
    await createForm.getByLabel(labels.custom.promptLabel).fill(originalPrompt);
    await createForm
      .getByRole('button', { name: labels.custom.saveCharacter, exact: true })
      .click();
    await expect(createForm).toBeHidden();

    const editor = callPage.configurationForm.getByRole('textbox');
    await expect(editor).toHaveValue(originalPrompt);
    await editor.fill(copiedPrompt);
    await page
      .getByRole('button', {
        exact: true,
        name: labels.savePreset.saveAsNew,
      })
      .click();
    const copyDialog = page.getByRole('dialog', {
      name: labels.savePreset.saveAsNewTitle,
    });
    await copyDialog.getByLabel(labels.savePreset.nameLabel).fill(copyName);
    const copyResponsePromise = page.waitForResponse('**/api/characters');
    await copyDialog
      .getByRole('button', {
        exact: true,
        name: labels.savePreset.save,
      })
      .click();
    const copyResponse = await copyResponsePromise;
    expect(copyResponse.request().postDataJSON()).not.toHaveProperty('id');
    expect(copyResponse.status()).toBe(201);
    const copy = (await copyResponse.json()) as ApiCharacterResponse;
    expect(copy.prompts?.localized_prompts?.[locale]).toBe(copiedPrompt);
    await expect(copyDialog).toBeHidden();
    const selectedCharacter = callPage.configurationForm.locator(
      'button[data-selected="true"]',
    );
    await expect(selectedCharacter).toContainText(copyName);
    await expect(editor).toHaveValue(copiedPrompt);
    await expect(
      page.getByRole('button', { exact: true, name: labels.startCall }),
    ).toBeEnabled();

    const characterCards = callPage.configurationForm.locator(
      'button[data-selected]',
    );
    const originalCard = characterCards.filter({ hasText: originalName });
    const copyCard = characterCards.filter({ hasText: copyName });

    // Selecting the original must restore its saved story, not the copy's text.
    await originalCard.click();
    await expect(editor).toHaveValue(originalPrompt);
    await copyCard.click();
    await expect(editor).toHaveValue(copiedPrompt);
    await editor.fill(updatedPrompt);
    const updateResponsePromise = page.waitForResponse('**/api/characters');
    await page
      .getByRole('button', { exact: true, name: labels.savePreset.save })
      .click();
    const updateResponse = await updateResponsePromise;
    expect(updateResponse.request().postDataJSON().id).toBe(copy.id);
    expect(updateResponse.status()).toBe(200);
    await expect(
      page.getByText(labels.savePreset.characterSaved, { exact: true }),
    ).toBeVisible();
    await originalCard.click();
    await expect(editor).toHaveValue(originalPrompt);
    await copyCard.click();
    await expect(editor).toHaveValue(updatedPrompt);
    expect(characters.size).toBe(2);
  });
}

test.describe('Call Dashboard - Unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/en/dashboard/call');

    // Should be redirected to login
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});

for (const viewport of ['desktop', 'mobile'] as const) {
  test(`custom voice and personality flow on ${viewport}`, async ({
    page,
    baseURL,
  }, testInfo) => {
    if (viewport === 'mobile')
      await page.setViewportSize({ width: 390, height: 844 });
    await setupCallPage(page, baseURL, 'paid');
    await page
      .getByRole('tab', { name: en.call.custom.custom, exact: true })
      .click();
    const personality = page.getByRole('button', { name: /Add a personality/ });
    await expect(personality).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.getByRole('button', { name: en.call.startCall, exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('link', { name: en.call.custom.cloneVoice }),
    ).toHaveAttribute('href', '/en/dashboard/clone?for=call');
    await page
      .getByRole('tab', { name: en.call.custom.myVoices, exact: true })
      .click();
    await page
      .getByRole('button', { name: 'My saved voice', exact: true })
      .click();
    await personality.click();
    await page
      .getByLabel(en.call.custom.promptLabel)
      .fill('Tell warm, concise stories.');
    await expect(
      page.getByRole('button', { name: en.call.startCall, exact: true }),
    ).toBeEnabled();
    await personality.click();
    await expect(personality).toHaveAttribute('aria-expanded', 'false');
    await page
      .getByRole('tab', { name: en.call.custom.characters, exact: true })
      .click();
    await page
      .getByRole('tab', { name: en.call.custom.custom, exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'My saved voice', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: en.call.startCall, exact: true }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await argosScreenshot(
      page,
      `call-custom-${viewport}-${testInfo.project.name}`,
    );
  });
}
