import { expect, type Locator, type Page } from '@playwright/test';

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
  readonly audioGeneratorCard: Locator;
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
    this.audioGeneratorCard = page
      .locator('[data-testid="audio-generator-card"]:visible')
      .first();
    // Target the main textarea inside the visible card
    this.textInput = this.audioGeneratorCard.getByTestId('generate-textarea');
    this.generateButton =
      this.audioGeneratorCard.getByTestId('generate-button');
    this.estimateCreditsButton = this.audioGeneratorCard.getByRole('button', {
      name: /estimate/i,
    });
    this.cancelButton = this.audioGeneratorCard.getByRole('button', {
      name: /cancel/i,
    });
    // Use Download Audio button to verify audio was generated (audio element itself is hidden)
    this.audioPlayer = this.audioGeneratorCard.getByRole('button', {
      name: /download audio/i,
    });
    // Use stable test id for character count (shows "X / Y" format)
    this.characterCountContainer = this.audioGeneratorCard.getByTestId(
      'generate-character-count',
    );
    this.styleInput = this.page.getByTestId('generate-style-textarea');
    this.enhanceTextButton = this.audioGeneratorCard.getByRole('button', {
      name: /enhance/i,
    });
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
    await this.textInput.waitFor({ state: 'visible', timeout: 15_000 });
    // Wait for React 19 hydration to complete before interacting.
    //
    // Background: domcontentloaded fires as soon as SSR HTML is parsed — the
    // textarea is already visible in the HTML, so waitFor({ state: 'visible' })
    // returns immediately. But React hasn't attached its synthetic event
    // listeners yet. If fill() fires at this point, the input event has nobody
    // listening on the React side, so onChange is never called, text state stays
    // '', and the character count/generate-button remain in their empty state.
    //
    // React writes __react* properties (fiber, props, events) onto DOM nodes
    // only after the hydration pass completes. Waiting for that property gives
    // us a reliable signal that React's event delegation is wired up.
    await this.page.waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="generate-textarea"]');
        if (!el) return false;
        return Object.keys(el).some((key) => key.startsWith('__react'));
      },
      { timeout: 15_000 },
    );
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
    const option = this.page.getByRole('option', {
      name: new RegExp(voiceName, 'i'),
    });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  /**
   * Enter text in the text input area
   * @param text - Text to generate audio from
   */
  async enterText(text: string) {
    // Use fill() instead of evaluate()+dispatch — Playwright's fill() simulates
    // real keyboard input that triggers React's synthetic onChange handler.
    // Setting element.value directly + dispatching a native Event bypasses
    // React's internal value tracker, so React never calls onChange and state
    // stays empty even though the DOM shows the value.
    await this.textInput.fill(text);
    await expect(this.textInput).toHaveValue(text);
    // Wait for React state to propagate to the character count display
    if (text.length > 0) {
      await expect(this.characterCountContainer).not.toHaveText(/^0 \//);
    }
  }

  /**
   * Click the generate audio button
   */
  async clickGenerate() {
    await expect(this.generateButton).toBeEnabled({ timeout: 10_000 });
    await this.generateButton.click();
  }

  /**
   * Click the estimate credits button (only available for Gemini voices)
   */
  async clickEstimateCredits() {
    await expect(this.estimateCreditsButton).toBeEnabled({ timeout: 10_000 });
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
  async waitForGenerationComplete(timeout = 15_000) {
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
      this.page.getByText(/failed|error|not enough|insufficient/i).first(),
    ).toBeVisible({ timeout: 15_000 });
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
    await expect(this.generateButton).toBeEnabled({ timeout: 10_000 });
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
      this.page.getByText(/don't have enough credits/i),
    ).toBeVisible();
  }
}
