import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page Object Model for Clone Dashboard
 *
 * Encapsulates interactions with the voice cloning page.
 * The page contains:
 * - Card with title "Clone a Voice" (localized)
 * - Tabs: Upload and Preview
 * - Audio file upload dropzone
 * - Microphone recording button
 * - Language selector for the cloned voice
 * - Text input for the text to convert
 * - Character count display
 * - Legal consent checkbox
 * - Clone/Generate button
 * - Sample audio accordion cards
 * - Cancel button (during generation)
 *
 * Usage:
 *   const clonePage = new ClonePage(page);
 *   await clonePage.goto();
 *   await clonePage.expectPageVisible();
 */
export class ClonePage {
  readonly page: Page;

  // Card title and description
  readonly cardTitle: Locator;
  readonly cardDescription: Locator;

  // Tabs
  readonly uploadTab: Locator;
  readonly previewTab: Locator;

  // Upload area
  readonly uploadDropzone: Locator;
  readonly fileInput: Locator;

  // Language selector
  readonly languageSelector: Locator;

  // Text input
  readonly textInput: Locator;
  readonly characterCount: Locator;

  // Legal consent
  readonly legalConsentCheckbox: Locator;
  readonly legalConsentLabel: Locator;

  // Action buttons
  readonly generateButton: Locator;
  readonly cancelButton: Locator;

  // Sample audio accordion
  readonly sampleAccordionItems: Locator;

  // Error / alert elements
  readonly errorAlert: Locator;
  readonly insufficientCreditsAlert: Locator;

  // Preview tab elements
  readonly previewTitle: Locator;
  readonly downloadButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Card heading and description
    this.cardTitle = page.getByTestId('clone-page-title');
    this.cardDescription = page.getByText(
      /upload.*audio|record.*voice|clone.*voice/i,
    );

    // Tabs
    this.uploadTab = page.getByRole('tab', { name: /upload/i });
    this.previewTab = page.getByRole('tab', { name: /preview/i });

    // Upload dropzone area — the button wrapping the file input
    this.uploadDropzone = page
      .locator('button')
      .filter({ hasText: /upload|drag.*drop|drop.*file/i })
      .first();
    this.fileInput = page.locator('input[aria-label="Upload audio file"]');

    // Language selector — the combobox for language selection
    this.languageSelector = page.getByTestId('clone-language-select');

    // Text input (textarea with placeholder)
    this.textInput = page.getByTestId('clone-text-input');
    // Character count (e.g., "0 / 500")
    this.characterCount = page.getByTestId('clone-character-count');

    // Legal consent checkbox
    this.legalConsentCheckbox = page.getByTestId('clone-legal-consent');
    this.legalConsentLabel = page.getByTestId('clone-legal-consent-label');

    // Generate/Clone button — the main CTA button
    // Use the stable data-testid for O(1) lookup instead of a regex role scan
    // across the entire DOM (which is expensive on this complex page).
    this.generateButton = page.getByTestId('clone-generate-button');
    this.cancelButton = page.getByRole('button', { name: /cancel/i });

    // Sample audio accordion items
    this.sampleAccordionItems = page.locator(
      '[data-testid^="clone-sample-trigger-"]',
    );

    // Error alerts
    this.errorAlert = page.locator('[role="alert"]').filter({
      hasText: /error|failed/i,
    });
    this.insufficientCreditsAlert = page.getByText(/not enough credits/i);

    // Preview tab elements
    this.previewTitle = page.getByRole('heading', { name: /preview/i });
    this.downloadButton = page.getByRole('button', {
      name: /download/i,
    });
  }

  /**
   * Navigate to the clone page
   */
  async goto() {
    await this.page.goto('/en/dashboard/clone', {
      waitUntil: 'domcontentloaded',
    });
    // Wait for the card title to appear
    await this.cardTitle.waitFor({ state: 'visible', timeout: 15_000 });
  }

  // --- Actions ---

  /**
   * Upload a file by setting the input files directly
   * This bypasses the dropzone UI interaction for reliability
   * @param filePath - Path to the file to upload
   */
  async uploadFile(filePath: string) {
    // The file input is sr-only, so we set files directly
    await this.fileInput.setInputFiles(filePath);
  }

  /**
   * Enter text into the text input
   * @param text - Text to type into the textarea
   */
  async enterText(text: string) {
    await this.textInput.fill(text);
    await expect(this.textInput).toHaveValue(text);
    await this.textInput.blur();
  }

  /**
   * Check the legal consent checkbox
   */
  async checkLegalConsent() {
    const state = await this.legalConsentCheckbox.getAttribute('data-state');
    if (state !== 'checked') {
      await this.legalConsentCheckbox.evaluate((el) =>
        (el as HTMLElement).click(),
      );
      await expect(this.legalConsentCheckbox).toHaveAttribute(
        'data-state',
        'checked',
      );
    }
  }

  /**
   * Uncheck the legal consent checkbox
   */
  async uncheckLegalConsent() {
    const state = await this.legalConsentCheckbox.getAttribute('data-state');
    if (state === 'checked') {
      await this.legalConsentCheckbox.evaluate((el) =>
        (el as HTMLElement).click(),
      );
      await expect(this.legalConsentCheckbox).toHaveAttribute(
        'data-state',
        'unchecked',
      );
    }
  }

  /**
   * Click the generate/clone button
   */
  async clickGenerate() {
    await this.generateButton.click();
  }

  /**
   * Click the cancel button during generation
   */
  async clickCancel() {
    await this.cancelButton.click();
  }

  /**
   * Select a language from the language selector
   * @param languageName - Name of the language to select (e.g., "English", "Spanish")
   */
  async selectLanguage(languageName: string) {
    await this.languageSelector.click();
    const options = this.page.getByRole('option');
    if ((await options.count()) === 0) {
      await this.languageSelector.click();
    }
    await options.first().waitFor({ state: 'visible', timeout: 5000 });
    const option = this.page.getByRole('option', {
      name: new RegExp(languageName, 'i'),
    });
    await expect(option).toBeVisible();
    await option.click();
  }

  /**
   * Click a sample audio accordion trigger by name
   * @param sampleName - Name of the sample to expand
   */
  async expandSampleAudio(sampleName: string) {
    const trigger = this.page.getByRole('button', {
      name: new RegExp(sampleName, 'i'),
    });
    await trigger.click();
  }

  /**
   * Switch to the Upload tab
   */
  async switchToUploadTab() {
    await this.uploadTab.click();
  }

  /**
   * Switch to the Preview tab
   */
  async switchToPreviewTab() {
    await this.previewTab.click();
  }

  // --- Assertions ---

  /**
   * Verify the clone page is visible with title and upload tab
   */
  async expectPageVisible() {
    await expect(this.cardTitle).toBeVisible();
    await expect(this.uploadTab).toBeVisible();
  }

  /**
   * Verify the upload dropzone area is visible
   */
  async expectUploadDropzoneVisible() {
    await expect(this.uploadDropzone).toBeVisible();
  }

  /**
   * Verify the language selector is visible
   */
  async expectLanguageSelectorVisible() {
    await expect(this.languageSelector).toBeVisible();
  }

  /**
   * Verify the text input is visible
   */
  async expectTextInputVisible() {
    await expect(this.textInput).toBeVisible();
  }

  /**
   * Verify the legal consent checkbox is visible
   */
  async expectLegalConsentVisible() {
    await expect(this.legalConsentCheckbox).toBeVisible();
  }

  /**
   * Verify the legal consent checkbox is unchecked
   */
  async expectLegalConsentUnchecked() {
    await expect(this.legalConsentCheckbox).toHaveAttribute(
      'data-state',
      'unchecked',
    );
  }

  /**
   * Verify the legal consent checkbox is checked
   */
  async expectLegalConsentChecked() {
    await expect(this.legalConsentCheckbox).toHaveAttribute(
      'data-state',
      'checked',
    );
  }

  /**
   * Verify the generate button is visible
   */
  async expectGenerateButtonVisible() {
    await expect(this.generateButton).toBeVisible();
  }

  /**
   * Verify the generate button is disabled
   */
  async expectGenerateButtonDisabled() {
    await expect(this.generateButton).toBeDisabled();
  }

  /**
   * Verify the generate button is enabled
   */
  async expectGenerateButtonEnabled() {
    await expect(this.generateButton).toBeEnabled({ timeout: 10_000 });
  }

  /**
   * Verify the generate button shows generating state
   */
  async expectGenerating() {
    await expect(this.generateButton).toContainText(
      /generating|cloning|converting/i,
      { timeout: 5000 },
    );
  }

  /**
   * Verify sample audio accordion items are present
   */
  async expectSampleAudiosPresent() {
    const count = await this.sampleAccordionItems.count();
    expect(count).toBeGreaterThan(0);
  }

  /**
   * Verify sample audio expanded content is visible
   * (shows source audio and example output sections)
   */
  async expectSampleAudioExpanded() {
    await expect(
      this.page.locator('[data-testid^="clone-sample-content-"]').first(),
    ).toHaveAttribute('data-state', 'open', { timeout: 5000 });
  }

  /**
   * Verify the insufficient credits alert is visible
   */
  async expectInsufficientCreditsVisible() {
    await expect(this.insufficientCreditsAlert).toBeVisible();
  }

  /**
   * Verify an error alert is visible
   */
  async expectErrorAlertVisible() {
    await expect(this.errorAlert.first()).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Verify the error toast notification is visible
   */
  async expectErrorToast() {
    await expect(
      this.page.getByText(/failed|error|could not/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Verify the preview tab content is visible after successful clone
   */
  async expectPreviewVisible() {
    await expect(this.previewTitle).toBeVisible({ timeout: 5000 });
    await expect(this.downloadButton).toBeVisible();
  }

  /**
   * Verify the character count display
   */
  async expectCharacterCount(expectedPattern: RegExp) {
    await expect(this.characterCount).toHaveText(expectedPattern, {
      timeout: 5000,
    });
  }

  /**
   * Verify the preview tab is disabled (before generation is complete)
   */
  async expectPreviewTabDisabled() {
    await expect(this.previewTab).toBeDisabled();
  }

  /**
   * Verify the tabs are visible
   */
  async expectTabsVisible() {
    await expect(this.uploadTab).toBeVisible();
    await expect(this.previewTab).toBeVisible();
  }

  /**
   * Get the text content of the character count display
   */
  async getCharacterCountText(): Promise<string> {
    return (await this.characterCount.textContent()) ?? '';
  }
}
