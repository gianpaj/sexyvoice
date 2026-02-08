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
  readonly characterCountContainer: Locator;
  readonly pageHeading: Locator;
  readonly styleInput: Locator;
  readonly enhanceTextButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Main UI elements
    this.pageHeading = page.getByRole('heading', { level: 2 });
    this.voiceSelector = page.getByRole('combobox').first();
    // Use placeholder to target the correct text input (not the style textarea)
    this.textInput = page.getByPlaceholder('Enter the text you want to convert to speech');
    this.generateButton = page.getByTestId('generate-button');
    this.estimateCreditsButton = page.getByRole('button', { name: /estimate/i });
    this.cancelButton = page.getByRole('button', { name: /cancel/i });
    // Use Download Audio button to verify audio was generated (audio element itself is hidden)
    this.audioPlayer = page.getByRole('button', { name: /download audio/i });
    // Use text content pattern to find character count (shows "X / Y" format)
    this.characterCountContainer = page.getByText(/^\d+\s*\/\s*\d+$/);
    this.styleInput = page.locator('textarea').nth(1); // Style textarea is the second one
    this.enhanceTextButton = page.getByRole('button', { name: /enhance/i });
  }

  /**
   * Navigate to the generate dashboard page
   */
  async goto() {
    // Use domcontentloaded instead of load to avoid hanging on async resources
    // (Supabase realtime, PostHog analytics, etc. can prevent load event)
    await this.page.goto('/en/dashboard/generate', {
      waitUntil: 'domcontentloaded',
    });
    // Wait for key UI elements to be visible
    await this.textInput.waitFor({ state: 'visible', timeout: 15000 });
  }

  /**
   * Select a voice from the dropdown
   * @param voiceName - Name of the voice (case insensitive, e.g., 'Poe', 'Zephyr')
   */
  async selectVoice(voiceName: string) {
    // Click the combobox to open the dropdown
    await this.voiceSelector.click();

    // Wait for the dropdown content to appear (Radix UI portals the content)
    // SelectItem elements have role="option" in Radix Select
    const option = this.page.getByRole('option', { name: new RegExp(voiceName, 'i') });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  /**
   * Enter text in the text input area
   * @param text - Text to generate audio from
   */
  async enterText(text: string) {
    // Focus the input and clear it
    await this.textInput.click();
    await this.textInput.clear();

    // Use keyboard.type which more reliably triggers React onChange than pressSequentially
    // First ensure focus is on the text input
    await this.textInput.focus();
    await this.page.keyboard.type(text, { delay: 1 });

    // Wait for the character count to update to ensure text is registered
    const expectedCount = text.length.toString();
    await expect(this.characterCountContainer).toContainText(expectedCount, { timeout: 30000 });
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
    return (await this.characterCountContainer.textContent()) ?? '';
  }

  /**
   * Expect character count to match a pattern
   * @param pattern - RegExp pattern to match (e.g., /11.*1000/)
   */
  async expectCharacterCountMatches(pattern: RegExp) {
    await expect(this.characterCountContainer).toHaveText(pattern);
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
    // Look for error-related text in toast notifications
    // Common error messages include "Failed to generate audio", "Voice generation failed", etc.
    // The toast uses sonner and appears in the notifications region
    await expect(
      this.page.getByText(/failed|error|not enough|insufficient/i).first()
    ).toBeVisible({ timeout: 15000 });
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
   * Waits for the button to become enabled (may take time after text input)
   */
  async expectGenerateButtonEnabled() {
    await expect(this.generateButton).toBeEnabled({ timeout: 10000 });
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
