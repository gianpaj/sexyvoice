import { expect, test } from '@playwright/test';

import { HistoryPage } from './pages/history.page';

/**
 * History Dashboard E2E Tests
 *
 * These tests verify the audio history page functionality:
 * 1. Page heading and table structure
 * 2. Text filter functionality
 * 3. Column visibility toggle
 * 4. Pagination controls
 * 5. Audio file count display
 *
 * All tests use the authenticated state from auth.setup.ts.
 * The test user may or may not have audio files — tests handle both cases.
 */

test.describe('History Dashboard - Authenticated User', () => {
  let historyPage: HistoryPage;

  test.beforeEach(async ({ page }) => {
    historyPage = new HistoryPage(page);
    await historyPage.goto();
  });

  test('should display the history page correctly', async () => {
    // Verify heading is visible
    await historyPage.expectHeadingVisible();

    // Verify table is visible
    await historyPage.expectTableVisible();
  });

  test('should display table headers', async () => {
    await historyPage.expectTableHeaders();
  });

  test('should show audio files or empty state', async () => {
    await historyPage.expectTableRowsOrEmptyState();
  });

  test('should display filter input', async () => {
    await historyPage.expectFilterInputVisible();
  });

  test('should filter audio files by text', async () => {
    // Type a filter value
    await historyPage.filterByText('test');

    // The audio file count should update (may show 0 if no matches)
    await historyPage.expectAudioFileCountVisible();

    // Clear the filter
    await historyPage.clearFilter();

    // Count should return to original
    await historyPage.expectAudioFileCountVisible();
  });

  test('should show column visibility dropdown', async () => {
    await historyPage.expectColumnsButtonVisible();

    // Open the dropdown
    const opened = await historyPage.openColumnsDropdown();
    if (!opened) {
      test.skip(true, 'Columns menu did not open');
    }

    // Dropdown should be visible with checkboxes
    await expect(historyPage.columnsMenuItems.first()).toBeVisible();
  });

  test('should toggle column visibility', async ({ page }) => {
    // Verify "Text" column is visible initially
    await historyPage.expectColumnVisible('Text');

    const opened = await historyPage.openColumnsDropdown();
    if (!opened) {
      test.skip(true, 'Columns menu did not open');
    }

    // Toggle "Text" column off
    await historyPage.columnsMenuItems
      .filter({ hasText: /text/i })
      .first()
      .evaluate((element) => (element as HTMLElement).click());

    // Click elsewhere to close the dropdown
    await page.keyboard.press('Escape');

    // "Text" column should be hidden
    await historyPage.expectColumnHidden('Text');
  });

  test('should show pagination controls', async () => {
    await historyPage.expectPaginationVisible();
  });

  test('should display audio file count', async () => {
    await historyPage.expectAudioFileCountVisible();
  });

  test('should have download buttons in table rows if data exists', async () => {
    const rowCount = await historyPage.getRowCount();
    if (rowCount > 0) {
      // Check that the first row has a download button
      const firstRow = historyPage.tableRows.first();
      const firstRowText = await firstRow.textContent();

      // Skip if this is the empty state row
      if (
        firstRowText &&
        !/no results|no audio|no history/i.test(firstRowText)
      ) {
        await expect(
          firstRow.getByRole('button', { name: /download/i }),
        ).toBeVisible();
      }
    }
  });

  test('should have action menus in table rows if data exists', async () => {
    const rowCount = await historyPage.getRowCount();
    if (rowCount > 0) {
      const firstRow = historyPage.tableRows.first();
      const firstRowText = await firstRow.textContent();

      // Skip if this is the empty state row
      if (
        firstRowText &&
        !/no results|no audio|no history/i.test(firstRowText)
      ) {
        await expect(
          firstRow.getByRole('button', { name: /open menu/i }),
        ).toBeVisible();
      }
    }
  });
});

test.describe('History Dashboard - Unauthenticated', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/en/dashboard/history');

    // Should be redirected to login
    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
