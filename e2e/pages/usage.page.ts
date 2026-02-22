import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Page Object Model for Usage Dashboard
 *
 * Encapsulates interactions with the usage statistics page.
 * The page contains:
 * - Heading "Usage Statistics" (localized)
 * - Two summary cards: Monthly and All-time
 * - Data table with columns: Source Type, Quantity, Credits Used, Date, Details
 * - Source type filter dropdown
 * - Page size selector (10, 20, 50)
 * - Server-side pagination with Previous/Next buttons
 *
 * Usage:
 *   const usagePage = new UsagePage(page);
 *   await usagePage.goto();
 *   await usagePage.expectSummaryCardsVisible();
 */
export class UsagePage {
  readonly page: Page;

  // Page heading
  readonly heading: Locator;

  // Summary cards
  readonly monthlySummaryCard: Locator;
  readonly allTimeSummaryCard: Locator;
  readonly summaryCards: Locator;

  // Data table elements
  readonly table: Locator;
  readonly tableHeaders: Locator;
  readonly tableRows: Locator;
  readonly emptyState: Locator;

  // Filter controls
  readonly sourceTypeFilter: Locator;
  readonly sourceTypeFilterTrigger: Locator;
  readonly pageSizeSelector: Locator;
  readonly pageSizeSelectorTrigger: Locator;

  // Pagination
  readonly previousButton: Locator;
  readonly nextButton: Locator;
  readonly pageInfo: Locator;

  // Error state
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page heading
    this.heading = page.getByRole('heading', { level: 2 });

    // Summary cards — they are Card components with CardTitle headings
    this.summaryCards = page.locator('[class*="card"]').filter({
      has: page.locator('[class*="card-title"], [class*="CardTitle"]'),
    });
    // Monthly summary card contains the current month name
    this.monthlySummaryCard = page
      .locator('[class*="card"]')
      .filter({
        hasText: /total credits/i,
      })
      .first();
    // All-time summary card
    this.allTimeSummaryCard = page
      .locator('[class*="card"]')
      .filter({
        hasText: /total credits/i,
      })
      .nth(1);

    // Data table
    this.table = page.locator('table');
    this.tableHeaders = page.locator('table thead th');
    this.tableRows = page.locator('table tbody tr');
    this.emptyState = page
      .locator('table tbody')
      .getByText(/no.*results|no.*data|no.*usage/i);

    // Source type filter
    this.sourceTypeFilterTrigger = page
      .locator('[role="combobox"]')
      .filter({ hasText: /all|tts|voice|call|audio/i })
      .first();
    this.sourceTypeFilter = page.locator('[role="listbox"]');

    // Page size selector
    this.pageSizeSelectorTrigger = page
      .locator('[role="combobox"]')
      .filter({ hasText: /10|20|50/ })
      .first();
    this.pageSizeSelector = page.locator('[role="listbox"]');

    // Pagination
    this.previousButton = page.getByRole('button', {
      name: 'Previous',
      exact: true,
    });
    this.nextButton = page.getByRole('button', { name: 'Next', exact: true });
    this.pageInfo = page.getByText(/page\s+\d+/i);

    // Error state
    this.errorMessage = page.getByText(/failed to load/i);
  }

  /**
   * Navigate to the usage page
   */
  async goto(searchParams?: string) {
    const url = searchParams
      ? `/en/dashboard/usage?${searchParams}`
      : '/en/dashboard/usage';
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    // Wait for the heading to appear
    await this.heading.waitFor({ state: 'visible', timeout: 15_000 });
  }

  // --- Actions ---

  /**
   * Select a source type filter value
   * @param sourceType - The source type to filter by (e.g., 'tts', 'voice_cloning', 'all')
   */
  async selectSourceTypeFilter(sourceType: string) {
    await this.sourceTypeFilterTrigger.click();
    const option = this.page.getByRole('option', {
      name: new RegExp(sourceType.replace('_', ' '), 'i'),
    });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
  }

  /**
   * Select a page size value
   * @param size - The page size to select (10, 20, or 50)
   */
  async selectPageSize(size: '10' | '20' | '50') {
    await this.pageSizeSelectorTrigger.click();
    const option = this.page.getByRole('option', { name: size });
    await option.waitFor({ state: 'visible', timeout: 5000 });
    await option.click();
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
   * Verify the page heading is visible and contains expected text
   */
  async expectHeadingVisible() {
    await expect(this.heading).toBeVisible();
    // Usage page heading — may be "Usage Statistics" or localized
    await expect(this.heading).toContainText(/usage|statistics/i);
  }

  /**
   * Verify both summary cards are visible
   */
  async expectSummaryCardsVisible() {
    await expect(this.monthlySummaryCard).toBeVisible();
    await expect(this.allTimeSummaryCard).toBeVisible();
  }

  /**
   * Verify a summary card shows total credits and operations
   * @param card - The summary card locator to check
   */
  async expectSummaryCardHasStats(card: Locator) {
    await expect(card.getByText(/total credits/i)).toBeVisible();
    await expect(card.getByText(/operations/i)).toBeVisible();
  }

  /**
   * Verify the monthly summary card displays current month name
   */
  async expectMonthlySummaryHasCurrentMonth() {
    const currentMonth = new Date().toLocaleDateString('en', {
      month: 'long',
    });
    await expect(
      this.monthlySummaryCard.getByText(new RegExp(currentMonth, 'i')),
    ).toBeVisible();
  }

  /**
   * Verify the data table is visible
   */
  async expectTableVisible() {
    await expect(this.table).toBeVisible();
  }

  /**
   * Verify expected table column headers are present
   */
  async expectTableHeaders() {
    // The usage table should have these columns (from columns.tsx)
    // Type, Quantity, Credits, Date, Details
    await expect(
      this.page.getByRole('columnheader', { name: /type/i }),
    ).toBeVisible();
    await expect(
      this.page.getByRole('columnheader', { name: /quantity/i }),
    ).toBeVisible();
    await expect(
      this.page.getByRole('columnheader', { name: /credits/i }),
    ).toBeVisible();
    await expect(
      this.page.getByRole('columnheader', { name: /date/i }),
    ).toBeVisible();
    await expect(
      this.page.getByRole('columnheader', { name: /details/i }),
    ).toBeVisible();
  }

  /**
   * Verify the table shows data rows or empty state
   */
  async expectTableRowsOrEmptyState() {
    const rowCount = await this.tableRows.count();
    if (rowCount === 1) {
      const firstRowText = await this.tableRows.first().textContent();
      if (
        firstRowText &&
        /no.*results|no.*data|no.*usage/i.test(firstRowText)
      ) {
        await expect(this.emptyState).toBeVisible();
        return;
      }
    }
    if (rowCount > 0) {
      await expect(this.tableRows.first()).toBeVisible();
    }
  }

  /**
   * Verify the source type filter dropdown is visible
   */
  async expectSourceTypeFilterVisible() {
    await expect(this.sourceTypeFilterTrigger).toBeVisible();
  }

  /**
   * Verify the page size selector is visible
   */
  async expectPageSizeSelectorVisible() {
    await expect(this.pageSizeSelectorTrigger).toBeVisible();
  }

  /**
   * Verify pagination controls are visible
   */
  async expectPaginationVisible() {
    await expect(this.previousButton).toBeVisible();
    await expect(this.nextButton).toBeVisible();
  }

  /**
   * Verify the URL contains the expected source type filter
   */
  async expectUrlHasSourceType(sourceType: string) {
    await expect(this.page).toHaveURL(new RegExp(`sourceType=${sourceType}`), {
      timeout: 5000,
    });
  }

  /**
   * Verify the URL contains the expected page size
   */
  async expectUrlHasPageSize(pageSize: string) {
    await expect(this.page).toHaveURL(new RegExp(`pageSize=${pageSize}`), {
      timeout: 5000,
    });
  }

  /**
   * Verify the error message is visible
   */
  async expectErrorVisible() {
    await expect(this.errorMessage).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Verify the page info text shows the expected page number
   */
  async expectPageNumber(pageNumber: number) {
    await expect(
      this.page.getByText(new RegExp(`page\\s+${pageNumber}`, 'i')),
    ).toBeVisible({ timeout: 5000 });
  }

  /**
   * Get the number of visible table rows
   */
  async getRowCount(): Promise<number> {
    return this.tableRows.count();
  }
}
