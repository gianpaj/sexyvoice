import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page Object Model for History Dashboard
 *
 * Encapsulates interactions with the audio history page.
 * The page contains:
 * - Heading "History" (localized)
 * - Data table with columns: File Name, Voice, Text, Created At, Preview, Download, Actions
 * - Text filter input
 * - Column visibility toggle dropdown
 * - Pagination controls (Previous/Next)
 * - Audio file count display
 * - Per-row actions: preview, download, delete
 *
 * Usage:
 *   const historyPage = new HistoryPage(page);
 *   await historyPage.goto();
 *   await historyPage.expectTableVisible();
 */
export class HistoryPage {
  readonly page: Page;

  // Page heading
  readonly heading: Locator;

  // Filter input
  readonly filterInput: Locator;

  // Audio file count text
  readonly audioFileCount: Locator;

  // Column visibility dropdown
  readonly columnsButton: Locator;
  readonly columnsDropdown: Locator;
  readonly columnsMenuItems: Locator;

  // Table elements
  readonly table: Locator;
  readonly tableHeaders: Locator;
  readonly tableRows: Locator;
  readonly emptyState: Locator;

  // Pagination
  readonly previousButton: Locator;
  readonly nextButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page heading
    this.heading = page.getByRole('heading', { level: 2 });

    // Filter input (placeholder: "Filter text...")
    this.filterInput = page.getByPlaceholder(/filter/i);

    // Audio file count (e.g., "5 audio files")
    this.audioFileCount = page.getByText(/\d+\s+audio files?/i);

    // Column visibility dropdown
    this.columnsButton = page.getByRole('button', {
      name: /columns|customize/i,
    });
    this.columnsDropdown = page.locator('[role="menu"]');
    this.columnsMenuItems = page.getByRole('menuitemcheckbox');

    // Table
    this.table = page.locator('table');
    this.tableHeaders = page.locator('table thead th');
    this.tableRows = page.locator('table tbody tr');
    this.emptyState = page
      .locator('table tbody')
      .getByText(/no results|no audio/i);

    // Pagination
    this.previousButton = page.getByRole('button', {
      name: 'Previous',
      exact: true,
    });
    this.nextButton = page.getByRole('button', { name: 'Next', exact: true });
  }

  /**
   * Navigate to the history page
   */
  async goto() {
    await this.page.goto('/en/dashboard/history', {
      waitUntil: 'domcontentloaded',
    });
    // Wait for the heading to appear
    await this.heading.waitFor({ state: 'visible', timeout: 15_000 });
  }

  // --- Actions ---

  /**
   * Type text into the filter input
   */
  async filterByText(text: string) {
    await this.filterInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.filterInput.click({ force: true });
    await this.filterInput.evaluate((element, value) => {
      const input = element as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, text);
  }

  /**
   * Clear the filter input
   */
  async clearFilter() {
    await this.filterInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.filterInput.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  /**
   * Open the column visibility dropdown
   */
  async openColumnsDropdown(): Promise<boolean> {
    try {
      await expect(this.columnsButton).toBeEnabled({ timeout: 10_000 });
      await this.columnsButton.focus();
      await this.page.keyboard.press('Enter');
      await this.columnsMenuItems
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Toggle a column's visibility in the dropdown
   * @param columnName - The name of the column to toggle (case insensitive)
   */
  async toggleColumnVisibility(columnName: string) {
    const opened = await this.openColumnsDropdown();
    if (!opened) return;
    const item = this.columnsMenuItems
      .filter({ hasText: new RegExp(columnName, 'i') })
      .first();
    await item.waitFor({ state: 'visible', timeout: 10_000 });
    await item.scrollIntoViewIfNeeded();
    await item.evaluate((element) => (element as HTMLElement).click());
  }

  /**
   * Click the download button for a specific row
   * @param rowIndex - 0-based row index
   */
  async clickDownloadForRow(rowIndex: number) {
    const row = this.tableRows.nth(rowIndex);
    await row.getByRole('button', { name: /download/i }).click();
  }

  /**
   * Click the actions menu button for a specific row
   * @param rowIndex - 0-based row index
   */
  async openActionsMenuForRow(rowIndex: number) {
    const row = this.tableRows.nth(rowIndex);
    await row.getByRole('button', { name: /open menu/i }).click();
  }

  /**
   * Click the Previous pagination button
   */
  async clickPrevious() {
    await this.previousButton.click();
  }

  /**
   * Click the Next pagination button
   */
  async clickNext() {
    await this.nextButton.click();
  }

  // --- Assertions ---

  /**
   * Verify the page heading is visible
   */
  async expectHeadingVisible() {
    await expect(this.heading).toBeVisible();
    await expect(this.heading).toContainText(/history/i);
  }

  /**
   * Verify the table structure is visible
   */
  async expectTableVisible() {
    await expect(this.table).toBeVisible();
  }

  /**
   * Verify expected table headers are present
   */
  async expectTableHeaders() {
    await expect(
      this.page.getByRole('columnheader', { name: 'File Name' }),
    ).toBeVisible();
    await expect(
      this.page.getByRole('columnheader', { name: 'Voice' }),
    ).toBeVisible();
    await expect(
      this.page.getByRole('columnheader', { name: 'Text' }),
    ).toBeVisible();
    await expect(
      this.page.getByRole('columnheader', { name: 'Created At' }),
    ).toBeVisible();
    await expect(
      this.page.getByRole('columnheader', { name: 'Preview' }),
    ).toBeVisible();
    await expect(
      this.page.getByRole('columnheader', { name: 'Download' }),
    ).toBeVisible();
  }

  /**
   * Verify the table has data rows or shows empty state
   */
  async expectTableRowsOrEmptyState() {
    const rowCount = await this.tableRows.count();
    if (rowCount === 1) {
      // Could be a single data row or the "no results" empty state row
      const firstRowText = await this.tableRows.first().textContent();
      if (firstRowText && /no results|no audio/i.test(firstRowText)) {
        // Empty state
        await expect(this.emptyState).toBeVisible();
        return;
      }
    }
    // If there are rows, at least one should be visible
    if (rowCount > 0) {
      await expect(this.tableRows.first()).toBeVisible();
    }
  }

  /**
   * Verify the audio file count text is visible
   */
  async expectAudioFileCountVisible() {
    await expect(this.audioFileCount).toBeVisible();
  }

  /**
   * Verify the filter input is visible
   */
  async expectFilterInputVisible() {
    await expect(this.filterInput).toBeVisible();
  }

  /**
   * Verify the columns button is visible
   */
  async expectColumnsButtonVisible() {
    await expect(this.columnsButton).toBeVisible();
  }

  /**
   * Verify pagination controls are visible
   */
  async expectPaginationVisible() {
    await expect(this.previousButton).toBeVisible();
    await expect(this.nextButton).toBeVisible();
  }

  /**
   * Verify a specific column is visible in the table headers
   */
  async expectColumnVisible(columnName: string) {
    await expect(
      this.page.locator('table thead').getByText(new RegExp(columnName, 'i')),
    ).toBeVisible();
  }

  /**
   * Verify a specific column is NOT visible in the table headers
   */
  async expectColumnHidden(columnName: string) {
    await expect(
      this.page.locator('table thead').getByText(new RegExp(columnName, 'i')),
    ).toBeHidden();
  }

  /**
   * Verify filtered results count matches expectations
   */
  async expectFilteredCount(expectedText: RegExp) {
    await expect(this.audioFileCount).toHaveText(expectedText, {
      timeout: 5000,
    });
  }

  /**
   * Get the number of visible table rows
   */
  async getRowCount(): Promise<number> {
    return this.tableRows.count();
  }
}
