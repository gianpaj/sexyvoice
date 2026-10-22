import type { Page, Response } from '@playwright/test';

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
 * These tests cover the character picker, the call panel and the creator:
 * 1. Fixture characters, credits, notices and FAQ on the picker
 * 2. Panel settings (language, scene gating) and Start call
 * 3. Creating, duplicating, editing and deleting characters
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

/**
 * Keeps character writes in the browser test. An ID denotes an update, so
 * the mock must not treat an empty or unknown ID as a successful creation.
 */
async function mockCharacterWrites(page: Page) {
  const characters = new Map<string, ApiCharacterResponse>();
  const deletes: string[] = [];
  await page.route('**/api/characters', async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    if (request.method() === 'DELETE') {
      deletes.push(body.id);
      characters.delete(body.id);
      await route.fulfill({ json: { success: true }, status: 200 });
      return;
    }
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
  return { characters, deletes };
}

const isCharacterPost = (response: Response) =>
  response.url().endsWith('/api/characters') &&
  response.request().method() === 'POST';

test.describe('Call Dashboard - Authenticated User', () => {
  let callPage: CallPage;

  test.beforeEach(async ({ page, baseURL }) => {
    callPage = await setupCallPage(page, baseURL);
  });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/*');
  });

  test('should display the character picker', async ({ page }, testInfo) => {
    await callPage.expectFixtureCharacters();
    await expect(
      callPage.ownCharacters.getByRole('link', {
        name: en.call.picker.upgrade,
      }),
    ).toHaveAttribute('href', '/en/dashboard/credits');
    await argosScreenshot(
      page,
      `call-dashboard-desktop-${testInfo.project.name}`,
    );
  });

  test('should open the call panel with settings for free users', async ({
    page,
  }, testInfo) => {
    await callPage.openCharacter('Lily');
    await expect(
      callPage.panel.getByRole('button', { name: en.call.startCall }),
    ).toBeEnabled();
    await expect(
      callPage.panel.getByRole('button', { name: en.call.panel.makeYourOwn }),
    ).toHaveCount(0);
    await argosScreenshot(page, `call-panel-desktop-${testInfo.project.name}`);
    await callPage.expectLanguageOptions();
    await callPage.expectSceneOptionsEnabled(false);
  });

  test('should display notice text and FAQ', async () => {
    await callPage.expectNoticeTextVisible();
    await callPage.expectCallFaqVisible();
  });
});

test.describe('Call Dashboard - Mobile Viewport', () => {
  test.use({ viewport: { height: 812, width: 375 } });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/*');
  });

  test('should display credits, characters and a bottom-sheet panel', async ({
    page,
    baseURL,
  }, testInfo) => {
    const callPage = await setupCallPage(page, baseURL);
    await callPage.expectCreditsSectionVisible();
    await callPage.expectFixtureCharacters();
    await callPage.expectNoHorizontalScroll();
    await argosScreenshot(
      page,
      `call-dashboard-mobile-${testInfo.project.name}`,
    );
    await callPage.openCharacter('Ramona');
    await argosScreenshot(page, `call-panel-mobile-${testInfo.project.name}`);
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
      if (viewport === 'mobile') {
        await callPage.expectCreditsSectionVisible();
      }
      await callPage.expectFixtureCharacters();
      await expect(
        callPage.ownCharacters.getByRole('button', {
          name: new RegExp(en.call.picker.createTitle),
        }),
      ).toBeVisible();
      await argosScreenshot(
        page,
        `call-dashboard-paid-${viewport}-${testInfo.project.name}`,
      );
      await callPage.openCharacter('Lily');
      await callPage.expectSceneOptionsEnabled(true);
    });

    test('creator with a saved voice and an example', async ({
      page,
      baseURL,
    }, testInfo) => {
      const callPage = await setupCallPage(page, baseURL, 'paid');
      await callPage.ownCharacters
        .getByRole('button', { name: new RegExp(en.call.picker.createTitle) })
        .click();
      const { creator } = callPage;
      await expect(creator).toBeVisible();
      await creator
        .getByRole('button', { exact: true, name: en.call.creator.save })
        .click();
      await expect(
        creator.getByText(en.call.creator.nameError, { exact: true }),
      ).toBeVisible();
      await creator
        .getByLabel(en.call.creator.name, { exact: true })
        .fill('Max');
      await creator
        .getByRole('button', {
          exact: true,
          name: en.call.creator.examples.coach.label,
        })
        .click();
      await creator.getByRole('radio', { name: /My saved voice/ }).check();
      await expect(
        page.getByText(en.call.creator.ready.replace('{name}', 'Max')),
      ).toBeVisible();
      await callPage.expectNoHorizontalScroll();
      await argosScreenshot(
        page,
        `call-creator-${viewport}-${testInfo.project.name}`,
      );

      await creator
        .getByRole('button', { name: new RegExp(en.call.voices.cloneTitle) })
        .click();
      const cloneDialog = page.getByTestId('clone-voice-dialog');
      await expect(
        cloneDialog.getByRole('button', { name: en.call.clone.recordNow }),
      ).toBeVisible();
      await cloneDialog
        .getByRole('button', { exact: true, name: en.call.clone.next })
        .click();
      await expect(
        cloneDialog.getByText(
          en.call.clone.needRecording.replace('{seconds}', '10'),
        ),
      ).toBeVisible();
      await argosScreenshot(
        page,
        `call-clone-${viewport}-${testInfo.project.name}`,
      );
    });
  });
}

for (const locale of ['en', 'de'] as const) {
  test(`creates, duplicates and edits characters in ${locale}`, async ({
    page,
    baseURL,
  }) => {
    const labels = (locale === 'de' ? de : en).call;
    const { characters } = await mockCharacterWrites(page);
    const callPage = await setupCallPage(page, baseURL, 'paid', locale);
    const { creator } = callPage;
    const originalPrompt = 'You are a friendly guide to the night sky.';
    const updatedPrompt = 'You are a friendly guide to the mountains.';
    const copyName = labels.creator.copyName.replace('{name}', 'Stargazer');

    // Create
    await callPage.ownCharacters
      .getByRole('button', { name: new RegExp(labels.picker.createTitle) })
      .click();
    await creator
      .getByLabel(labels.creator.name, { exact: true })
      .fill('Stargazer');
    await creator
      .getByRole('textbox', { name: labels.creator.personality })
      .fill(originalPrompt);
    const createResponse = page.waitForResponse(isCharacterPost);
    await creator
      .getByRole('button', { exact: true, name: labels.creator.save })
      .click();
    const created = await createResponse;
    expect(created.request().postDataJSON()).not.toHaveProperty('id');
    expect(created.status()).toBe(201);
    await expect(
      callPage.panel.getByRole('heading', { exact: true, name: 'Stargazer' }),
    ).toBeVisible();
    await expect(
      callPage.panel.getByRole('button', { name: labels.startCall }),
    ).toBeEnabled();
    await callPage.panel
      .getByRole('button', { exact: true, name: labels.panel.close })
      .click();

    // Duplicate keeps the prompt and saves a new character
    await page
      .getByRole('button', {
        exact: true,
        name: labels.picker.moreOptions.replace('{name}', 'Stargazer'),
      })
      .click();
    await page
      .getByRole('menuitem', { exact: true, name: labels.picker.duplicate })
      .click();
    await expect(
      creator.getByLabel(labels.creator.name, { exact: true }),
    ).toHaveValue(copyName);
    const copyResponse = page.waitForResponse(isCharacterPost);
    await creator
      .getByRole('button', { exact: true, name: labels.creator.save })
      .click();
    const copy = (await (await copyResponse).json()) as ApiCharacterResponse;
    expect(copy.prompts?.localized_prompts?.[locale]).toBe(originalPrompt);
    await callPage.panel
      .getByRole('button', { exact: true, name: labels.panel.close })
      .click();

    // Edit the copy; the original keeps its prompt
    await page
      .getByRole('button', {
        exact: true,
        name: labels.picker.moreOptions.replace('{name}', copyName),
      })
      .click();
    await page
      .getByRole('menuitem', { exact: true, name: labels.picker.edit })
      .click();
    const personality = creator.getByRole('textbox', {
      name: labels.creator.personality,
    });
    await expect(personality).toHaveValue(originalPrompt);
    await personality.fill(updatedPrompt);
    const updateResponse = page.waitForResponse(isCharacterPost);
    await creator
      .getByRole('button', { exact: true, name: labels.creator.saveChanges })
      .click();
    const updated = await updateResponse;
    expect(updated.request().postDataJSON().id).toBe(copy.id);
    expect(updated.status()).toBe(200);
    expect(characters.size).toBe(2);
    const stored = [...characters.values()].map(
      (c) => c.prompts?.localized_prompts?.[locale],
    );
    expect(stored).toHaveLength(2);
    expect(stored).toEqual(
      expect.arrayContaining([originalPrompt, updatedPrompt]),
    );
  });
}

test('delete waits for the Undo toast and Undo keeps the character', async ({
  page,
  baseURL,
}) => {
  const { deletes } = await mockCharacterWrites(page);
  const callPage = await setupCallPage(page, baseURL, 'paid');
  await callPage.ownCharacters
    .getByRole('button', { name: new RegExp(en.call.picker.createTitle) })
    .click();
  await callPage.creator
    .getByLabel(en.call.creator.name, { exact: true })
    .fill('Temp');
  await callPage.creator
    .getByRole('button', {
      exact: true,
      name: en.call.creator.examples.friend.label,
    })
    .click();
  await callPage.creator
    .getByRole('button', { exact: true, name: en.call.creator.save })
    .click();
  await callPage.closePanel();

  await callPage.openCharacterMenu('Temp', 'Delete');
  await expect(
    callPage.ownCharacters.getByRole('button', { name: 'Open Temp' }),
  ).toHaveCount(0);
  await page.getByRole('button', { exact: true, name: 'Undo' }).click();
  await expect(
    callPage.ownCharacters.getByRole('button', { name: 'Open Temp' }),
  ).toBeVisible();
  expect(deletes).toEqual([]);
});

test.describe('Call Dashboard - Unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/en/dashboard/call');

    // Should be redirected to login
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
