import { expect, test } from '@playwright/test';

const mockBillingUsageResponse = {
  object: 'list',
  bucket_width: '1d',
  start_time: 1_740_700_800,
  end_time: 1_741_305_600,
  start_time_iso: '2025-02-28T00:00:00.000Z',
  end_time_iso: '2025-03-07T00:00:00.000Z',
  group_by: 'source_type',
  source_type: null,
  api_key_id: null,
  data: [
    {
      object: 'bucket',
      start_time: 1_740_700_800,
      end_time: 1_740_787_200,
      start_time_iso: '2025-02-28T00:00:00.000Z',
      end_time_iso: '2025-03-01T00:00:00.000Z',
      results: [
        {
          source_type: 'api_tts',
          api_key_id: null,
          model: null,
          requests: 12,
          total_input_chars: 1200,
          total_output_chars: 0,
          total_duration_seconds: 0,
          total_dollar_amount: 1.25,
          total_credits_used: 42,
        },
      ],
    },
  ],
};

test.describe('API Billing Dashboard - Authenticated User', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/billing/usage**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockBillingUsageResponse),
      });
    });
  });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/*');
  });

  test('should display the billing dashboard and filters', async ({ page }) => {
    await page.goto('/en/dashboard/api-billing', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.getByRole('heading', { name: /api billing/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/monitor api usage, requests, and costs/i),
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
    await page.getByRole('option', { name: 'API TTS', exact: true }).click();

    await expect(page).toHaveURL(/source_type=api_tts/);
  });
});
