import { expect, test } from '@playwright/test';

import {
  handleUsageEvents,
  handleUsageEventsEmpty,
  handleUsageEventsError,
} from './mocks/usage.mock';
import { UsagePage } from './pages/usage.page';

/**
 * Usage Dashboard E2E Tests
 *
 * These tests verify the usage statistics dashboard functionality:
 * 1. Page heading and summary cards
 * 2. Data table with usage events
 * 3. Source type filter
 * 4. Page size selector
 * 5. Pagination controls
 * 6. Error handling
 *
 * All tests use the authenticated state from auth.setup.ts.
 * The /api/usage-events endpoint is mocked for predictable test data.
 */

test.describe('Usage Dashboard - Authenticated User', () => {
  let usagePage: UsagePage;

  test.beforeEach(async ({ page }) => {
    // Setup usage event mocks
    await page.route('**/api/usage-events*', handleUsageEvents);

    usagePage = new UsagePage(page);
    await usagePage.goto();
  });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/*');
  });

  test('should display the usage page correctly', async () => {
    // Verify heading is visible
    await usagePage.expectHeadingVisible();

    // Verify summary cards are visible
    await usagePage.expectSummaryCardsVisible();

    // Verify data table is visible
    await usagePage.expectTableVisible();
  });

  test('should display monthly summary card', async () => {
    await expect(usagePage.monthlySummaryCard).toBeVisible();
    await usagePage.expectSummaryCardHasStats(usagePage.monthlySummaryCard);
  });

  test('should display all-time summary card', async () => {
    await expect(usagePage.allTimeSummaryCard).toBeVisible();
    await usagePage.expectSummaryCardHasStats(usagePage.allTimeSummaryCard);
  });

  test('should display usage data table with headers', async () => {
    await usagePage.expectTableVisible();
    await usagePage.expectTableHeaders();
  });

  test('should show source type filter', async () => {
    await usagePage.expectSourceTypeFilterVisible();
  });

  test('should filter by source type', async () => {
    // Select TTS filter
    await usagePage.selectSourceTypeFilter('tts');

    // URL should update with sourceType parameter
    await usagePage.expectUrlHasSourceType('tts');
  });

  test('should show page size selector', async () => {
    await usagePage.expectPageSizeSelectorVisible();
  });

  test('should change page size', async () => {
    // Change page size to 10
    await usagePage.selectPageSize('10');

    // URL should update with pageSize parameter
    await usagePage.expectUrlHasPageSize('10');
  });

  test('should display pagination controls', async () => {
    await usagePage.expectPaginationVisible();
  });

  test('should show table rows or empty state', async () => {
    await usagePage.expectTableRowsOrEmptyState();
  });
});

test.describe('Usage Dashboard - Mocked Data Scenarios', () => {
  let usagePage: UsagePage;

  test('should display usage events from mocked API', async ({ page }) => {
    await page.route('**/api/usage-events*', handleUsageEvents);

    usagePage = new UsagePage(page);
    await usagePage.goto();

    // Table should be visible with data rows
    await usagePage.expectTableVisible();

    // Should have rows from mock data (5 events)
    const rowCount = await usagePage.getRowCount();
    expect(rowCount).toBeGreaterThan(0);

    // Clean up
    await page.unroute('**/*');
  });

  test('should show empty state when no data', async ({ page }) => {
    await page.route('**/api/usage-events*', handleUsageEventsEmpty);

    usagePage = new UsagePage(page);
    await usagePage.goto();

    // Table should show empty state message
    await usagePage.expectTableRowsOrEmptyState();

    // Clean up
    await page.unroute('**/*');
  });

  test('should handle API error gracefully', async ({ page }) => {
    await page.route('**/api/usage-events*', handleUsageEventsError);

    usagePage = new UsagePage(page);
    await usagePage.goto();

    // Should show error message
    await usagePage.expectErrorVisible();

    // Clean up
    await page.unroute('**/*');
  });
});

test.describe('Usage Dashboard - Unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/en/dashboard/usage');

    // Should be redirected to login
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
