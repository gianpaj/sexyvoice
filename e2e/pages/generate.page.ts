import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object Model for Generate Dashboard
 *
 * Encapsulates interactions with the generate dashboard page.
 * Makes tests more maintainable by centralizing selectors and actions.
 *
 * Usage:
 * const generatePage = new GeneratePage(page);
 * await generatePage.goto();
 * await generatePage.selectVoice('Poe');
 * await generatePage.enterText('Hello world');
 * await generatePage.clickGenerate();
 */
export class GeneratePage {
  readonly page: Page;
  readonly voiceSelector: Locator;
  readonly textInput: Locator;
  readonly generateButton: Locator;
  readonly estimateCreditsButton: Locator;
  readonly cancelButton: Locator;
  readonly audioPlayer: Locator;
  readonly characterCount: Locator;
  readonly pageHeading: Locator;
  readonly styleInput: Locator;
  readonly enhanceTextButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Main UI elements
    this.pageHeading = page.getByRole('heading', { level: 2 });
    this.voiceSelector = page.getByRole('combobox').first();
    this.textInput = page.locator('textarea').first();
    this.generateButton = page.getByTestId('generate-button');
    this.estimateCreditsButton = page.getByRole('button', { name: /estimate/i });
    this.cancelButton = page.getByRole('button', { name: /cancel/i });
    this.audioPlayer = page.locator('audio, [data-testid="audio-player"]');
    this.characterCount = page.locator('.text-muted-foreground.text-sm');
    this.styleInput = page.locator('textarea').nth(1); // Style textarea is the second one
    this.enhanceTextButton = page.getByRole('button', { name: /enhance/i });
  }

  /**
   * Navigate to the generate dashboard page
   */
  async goto() {
    await this.page.goto('/en/dashboard/generate');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Select a voice from the dropdown
   * @param voiceName - Name of the voice (case insensitive, e.g., 'Poe', 'Zephyr')
   */
  async selectVoice(voiceName: string) {
    await this.voiceSelector.click();
    await this.page
      .getByRole('option', { name: new RegExp(voiceName, 'i') })
      .click();
  }

  /**
   * Enter text in the text input area
   * @param text - Text to generate audio from
   */
  async enterText(text: string) {
    await this.textInput.fill(text);
  }

  /**
   * Click the generate audio button
   */
  async clickGenerate() {
    await this.generateButton.click();
  }

  /**
   * Click the estimate credits button (only available for Gemini voices)
   */
  async clickEstimateCredits() {
    await this.estimateCreditsButton.click();
  }

  /**
   * Click the cancel button during generation
   */
  async clickCancel() {
    await this.cancelButton.click();
  }

  /**
   * Click the enhance text button
   */
  async clickEnhanceText() {
    await this.enhanceTextButton.click();
  }

  /**
   * Enter style/mood text (only for Gemini voices)
   * @param style - Style description (e.g., 'excited', 'calm')
   */
  async enterStyle(style: string) {
    await this.styleInput.fill(style);
  }

  /**
   * Wait for audio generation to complete
   * Watches the generate button state change from "Generating..." back to "Generate"
   */
  async waitForGenerationComplete(timeout = 15000) {
    // Wait for generating state
    await expect(this.generateButton).toContainText(/generating/i, {
      timeout: 5000,
    });

    // Wait for completion (button returns to normal)
    await expect(this.generateButton).toContainText(/generate/i, { timeout });
  }

  /**
   * Expect the audio player to be visible
   */
  async expectAudioPlayerVisible() {
    await expect(this.audioPlayer).toBeVisible({ timeout: 5000 });
  }

  /**
   * Expect the page heading to contain specific text
   */
  async expectHeadingContains(text: string | RegExp) {
    await expect(this.pageHeading).toContainText(text);
  }

  /**
   * Get the current character count text
   * @returns Character count string (e.g., "50 / 1000")
   */
  async getCharacterCount(): Promise<string> {
    return (await this.characterCount.textContent()) ?? '';
  }

  /**
   * Expect character count to match a pattern
   * @param pattern - RegExp pattern to match (e.g., /11.*1000/)
   */
  async expectCharacterCountMatches(pattern: RegExp) {
    await expect(this.characterCount).toHaveText(pattern);
  }

  /**
   * Expect a toast notification with specific text
   * @param text - Text to look for in the toast
   */
  async expectToast(text: string | RegExp) {
    await expect(this.page.getByText(text)).toBeVisible({ timeout: 5000 });
  }

  /**
   * Expect an error toast
   */
  async expectErrorToast() {
    await expect(this.page.getByText(/error|failed/i)).toBeVisible({
      timeout: 5000,
    });
  }

  /**
   * Expect a success toast
   */
  async expectSuccessToast() {
    await expect(this.page.getByText(/success/i)).toBeVisible({
      timeout: 5000,
    });
  }

  /**
   * Expect the generate button to be enabled
   */
  async expectGenerateButtonEnabled() {
    await expect(this.generateButton).toBeEnabled();
  }

  /**
   * Expect the generate button to be disabled
   */
  async expectGenerateButtonDisabled() {
    await expect(this.generateButton).toBeDisabled();
  }

  /**
   * Expect estimated credits to be displayed
   * @param credits - Expected credit amount (e.g., 15)
   */
  async expectEstimatedCredits(credits: number) {
    await expect(this.page.getByText(new RegExp(`~${credits}`))).toBeVisible();
  }

  /**
   * Expect insufficient credits alert to be visible
   */
  async expectInsufficientCreditsAlert() {
    await expect(
      this.page.getByText(/don't have enough credits/i)
    ).toBeVisible();
  }
}
