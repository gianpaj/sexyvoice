import { expect, test } from '@playwright/test';

const mockBillingUsageResponse = {
  api_key_id: null,
  bucket_width: '1d',
  data: [
    {
      end_time: 1_740_787_200,
      end_time_iso: '2025-03-01T00:00:00.000Z',
      object: 'bucket',
      results: [
        {
          api_key_id: null,
          model: null,
          requests: 12,
          source_type: 'api_tts',
          total_credits_used: 42,
          total_duration_seconds: 0,
          total_input_chars: 1200,
          total_output_chars: 0,
        },
      ],
      start_time: 1_740_700_800,
      start_time_iso: '2025-02-28T00:00:00.000Z',
    },
  ],
  end_time: 1_741_305_600,
  end_time_iso: '2025-03-07T00:00:00.000Z',
  group_by: 'source_type',
  object: 'list',
  source_type: null,
  start_time: 1_740_700_800,
  start_time_iso: '2025-02-28T00:00:00.000Z',
};

test.describe('API Billing Dashboard - Authenticated User', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/billing/usage**', async (route) => {
      await route.fulfill({
        body: JSON.stringify(mockBillingUsageResponse),
        contentType: 'application/json',
        status: 200,
      });
    });
  });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/api/billing/usage**');
  });

  test('should display the billing dashboard and filters', async ({ page }) => {
    await page.goto('/en/dashboard/api-billing', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('heading', { name: /api billing/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/monitor api usage and requests/i),
    ).toBeVisible();
    await expect(page.getByText('From', { exact: true })).toBeVisible();
    await expect(page.getByText('To', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('combobox').filter({ hasText: /group: source type/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox').filter({ hasText: /daily/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox').filter({ hasText: /all api sources/i }),
    ).toBeVisible();
  });

  test('should allow filtering by source type', async ({ page }) => {
    await page.goto('/en/dashboard/api-billing', {
      waitUntil: 'domcontentloaded',
    });

    const sourceTypeSelect = page
      .getByRole('combobox')
      .filter({ hasText: /all api sources/i });
    await sourceTypeSelect.click();
    await page.getByRole('option', { exact: true, name: 'API TTS' }).click();

    await expect(page).toHaveURL(/source_type=api_tts/);
  });
});
