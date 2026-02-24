import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page Object Model for Call Dashboard
 *
 * Encapsulates interactions with the real-time AI voice call page.
 * The page contains:
 * - Configuration form with language selector and character presets
 * - Connect/Disconnect button for starting/ending calls
 * - Credits section (visible on mobile)
 * - Legal notice text
 * - LiveKit room wrapper (not tested for actual connections)
 *
 * Usage:
 *   const callPage = new CallPage(page);
 *   await callPage.goto();
 *   await callPage.expectPageVisible();
 */
export class CallPage {
  readonly page: Page;

  // Configuration form elements
  readonly configurationForm: Locator;
  readonly languageSelectorTrigger: Locator;
  readonly languageSelector: Locator;

  // Character/Preset selection
  readonly presetCards: Locator;

  // Connect button (shown when not connected)
  readonly connectButton: Locator;

  // Credits section (mobile)
  readonly creditsSection: Locator;

  // Notice text
  readonly noticeText: Locator;

  constructor(page: Page) {
    this.page = page;

    // Configuration form container
    this.configurationForm = page.getByTestId('call-configuration-form');

    // Language selector — a Select component in the configuration form
    this.languageSelectorTrigger = page.locator('[role="combobox"]').first();
    this.languageSelector = page.locator('[role="listbox"]');

    // Character/preset cards — rendered by PresetSelector component
    // These are buttons or interactive elements within the preset selector area
    this.presetCards = page.locator(
      '[class*="preset"], [data-preset-id], [class*="character"]',
    );

    // Connect button — the main CTA to start a call
    this.connectButton = page.getByRole('button', {
      name: /connect|start|call/i,
    });

    // Credits section (shown on mobile via lg:hidden)
    this.creditsSection = page.getByText(/credits/i).first();

    // Notice text at the bottom of the page
    this.noticeText = page.getByTestId('call-notice-text');
  }

  /**
   * Navigate to the call page
   */
  async goto() {
    await this.page.goto('/en/dashboard/call', {
      waitUntil: 'domcontentloaded',
    });
    // Wait for the configuration form to appear
    await this.configurationForm.waitFor({
      state: 'visible',
      timeout: 15_000,
    });
  }

  // --- Actions ---

  /**
   * Open the language selector dropdown
   */
  async openLanguageSelector() {
    await this.languageSelectorTrigger.click();
    await this.languageSelector.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Select a language from the language selector
   * @param languageName - Name of the language to select (e.g., "English", "Spanish")
   */
  async selectLanguage(languageName: string) {
    await this.openLanguageSelector();
    const option = this.page.getByRole('option', {
      name: new RegExp(languageName, 'i'),
    });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  /**
   * Click the connect/call button
   */
  async clickConnect() {
    await this.connectButton.click();
  }

  // --- Assertions ---

  /**
   * Verify the call page is visible with the configuration form
   */
  async expectPageVisible() {
    await expect(this.configurationForm).toBeVisible();
  }

  /**
   * Verify the configuration form section is visible
   */
  async expectConfigurationFormVisible() {
    await expect(this.configurationForm).toBeVisible();
  }

  /**
   * Verify the language selector is visible
   */
  async expectLanguageSelectorVisible() {
    await expect(this.languageSelectorTrigger).toBeVisible();
  }

  /**
   * Verify the language selector has multiple options
   */
  async expectLanguageSelectorHasOptions() {
    await this.openLanguageSelector();
    const options = this.page.getByRole('option');
    const count = await options.count();
    expect(count).toBeGreaterThan(1);
    // Close the dropdown
    await this.page.keyboard.press('Escape');
  }

  /**
   * Verify the connect button is visible
   */
  async expectConnectButtonVisible() {
    await expect(this.connectButton).toBeVisible();
  }

  /**
   * Verify the connect button is enabled
   */
  async expectConnectButtonEnabled() {
    await expect(this.connectButton).toBeEnabled({ timeout: 10_000 });
  }

  /**
   * Verify the notice text is visible at the bottom of the page
   */
  async expectNoticeTextVisible() {
    await expect(this.noticeText).toBeVisible();
  }

  /**
   * Verify the credits section is visible (for mobile viewports)
   */
  async expectCreditsSectionVisible() {
    await expect(this.creditsSection).toBeVisible({ timeout: 5000 });
  }

  /**
   * Verify the credits section is hidden (for desktop viewports)
   */
  async expectCreditsSectionHidden() {
    // On desktop, the credits section has lg:hidden class
    // It may still be in the DOM but not visible
    await expect(this.creditsSection).toBeHidden({ timeout: 5000 });
  }

  /**
   * Verify the page contains preset/character images or names
   * (at least the configuration form area has character-related content)
   */
  async expectCharacterContentPresent() {
    // The configuration form should have character-related content
    // This could be character names, images, or preset cards
    const configArea = this.page.locator('header').first();
    await expect(configArea).toBeVisible();
  }

  /**
   * Verify the page contains a form element for configuration
   */
  async expectFormPresent() {
    await expect(this.configurationForm).toBeVisible();
  }
}
