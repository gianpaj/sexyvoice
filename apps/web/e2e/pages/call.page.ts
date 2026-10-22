import { expect, type Locator, type Page } from '@playwright/test';

import { E2E_PUBLIC_CALL_CHARACTERS } from '@/lib/e2e-mocks-shared';

/**
 * Page Object Model for Call Dashboard
 *
 * The page has three screens and a panel:
 * - Picker: "Your characters" (Create card first) and "Featured" grids
 * - Creator: name, personality and voice sections with a sticky save bar
 * - Call panel: a sheet with voice, language, scene, microphone and Start call
 * - In call / ended (not covered: tests never connect to LiveKit)
 *
 * Usage:
 *   const callPage = new CallPage(page);
 *   await callPage.goto();
 *   await callPage.openCharacter('Lily');
 */
export class CallPage {
  readonly page: Page;

  readonly experience: Locator;
  readonly picker: Locator;
  readonly ownCharacters: Locator;
  readonly featuredCharacters: Locator;
  readonly creator: Locator;
  readonly panel: Locator;

  // Credits section (mobile)
  readonly creditsSection: Locator;

  // Notice text
  readonly noticeText: Locator;

  // FAQ section (shown only when no call is in progress)
  readonly callFaq: Locator;

  constructor(page: Page) {
    this.page = page;
    this.experience = page.getByTestId('call-experience');
    this.picker = page.getByTestId('character-picker');
    // Located by heading ID so the same object works in every locale.
    this.ownCharacters = this.picker.locator(
      'section[aria-labelledby="call-own"]',
    );
    this.featuredCharacters = this.picker.locator(
      'section[aria-labelledby="call-featured"]',
    );
    this.creator = page.getByTestId('character-creator');
    this.panel = page.getByTestId('call-panel');
    this.creditsSection = page.getByTestId('call-mobile-credits');
    this.noticeText = page.getByTestId('call-notice-text');
    this.callFaq = page.getByTestId('call-faq');
  }

  /**
   * Navigate to the call page
   */
  async goto(locale: 'en' | 'de' = 'en') {
    await this.page.goto(`/${locale}/dashboard/call`, {
      waitUntil: 'domcontentloaded',
    });
    await this.picker.waitFor({ state: 'visible', timeout: 15_000 });
  }

  // --- Actions ---

  /** Opens the call panel from a character card. */
  async openCharacter(name: string) {
    await this.picker
      .getByRole('button', { exact: true, name: `Call ${name}` })
      .click();
    await expect(this.panel).toBeVisible();
    await expect(
      this.panel.getByRole('heading', { exact: true, name }),
    ).toBeVisible();
  }

  async openCharacterMenu(name: string, item: 'Edit' | 'Duplicate' | 'Delete') {
    await this.picker
      .getByRole('button', { exact: true, name: `More options for ${name}` })
      .click();
    await this.page.getByRole('menuitem', { exact: true, name: item }).click();
  }

  async closePanel() {
    await this.panel
      .getByRole('button', { exact: true, name: 'Close' })
      .click();
    await expect(this.panel).toBeHidden();
  }

  // --- Assertions ---

  async expectFixtureCharacters() {
    await expect(
      this.page.locator('[data-e2e-call-fixtures]'),
      'Start the Next.js server with E2E_TEST_MODE=true before taking call screenshots',
    ).toBeVisible();
    await expect(this.featuredCharacters.locator('article')).toHaveCount(
      E2E_PUBLIC_CALL_CHARACTERS.length,
    );
    for (const character of E2E_PUBLIC_CALL_CHARACTERS) {
      const card = this.featuredCharacters.locator(
        `[data-character-id="${character.id}"]`,
      );
      await expect(card).toContainText(character.name);
      await expect(card).toContainText(character.localized_descriptions.en);
    }
  }

  /** Expects the panel's scene options to match the user's plan. */
  async expectSceneOptionsEnabled(enabled: boolean) {
    await this.panel
      .getByTestId('call-scene-selector')
      .getByRole('combobox')
      .click();
    const listbox = this.page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const options = listbox.getByRole('option');
    await expect(options.first()).toHaveText('No scene');
    await expect(options.first()).toBeEnabled();
    const count = await options.count();
    expect(count).toBeGreaterThan(1);
    for (let index = 1; index < count; index++) {
      await expect(options.nth(index)).toBeEnabled({ enabled });
    }
    await this.page.keyboard.press('Escape');
    await expect(listbox).toBeHidden();
  }

  async expectLanguageOptions() {
    await this.panel.getByRole('combobox', { name: 'Language' }).click();
    const options = this.page.getByRole('option');
    expect(await options.count()).toBeGreaterThan(1);
    await this.page.keyboard.press('Escape');
  }

  async expectNoticeTextVisible() {
    await expect(this.noticeText).toBeVisible();
  }

  async expectCallFaqVisible() {
    await expect(this.callFaq).toBeVisible();
  }

  async expectCreditsSectionVisible() {
    await expect(this.creditsSection).toBeVisible({ timeout: 5000 });
  }

  async expectNoHorizontalScroll() {
    expect(
      await this.page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
}
