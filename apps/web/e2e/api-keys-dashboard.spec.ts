import { expect, test } from '@playwright/test';

const mockApiKeys = [
  {
    created_at: '2026-03-01T12:00:00.000Z',
    expires_at: null,
    id: 'key-1',
    is_active: true,
    key_prefix: 'sk_live_abc123',
    last_used_at: '2026-03-10T09:30:00.000Z',
    name: 'Production backend',
  },
];

test.describe('API Keys Dashboard - Authenticated User', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/api-keys', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ data: mockApiKeys }),
        contentType: 'application/json',
        status: 200,
      });
    });
  });

  test.afterEach(async ({ page }) => {
    await page.unroute('**/api/api-keys');
  });

  test('should display existing API keys', async ({ page }) => {
    await page.goto('/en/dashboard/api-keys', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      page.locator('#main-content').getByText('API Keys', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Production backend' }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('cell', { name: /active/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /new key/i })).toBeVisible();
  });

  test('should expose API key creation controls', async ({ page }) => {
    await page.goto('/en/dashboard/api-keys', {
      waitUntil: 'domcontentloaded',
    });

    const newKeyButton = page.getByRole('button', { name: /new key/i });
    await expect(newKeyButton).toBeVisible();

    if (await newKeyButton.isEnabled()) {
      await newKeyButton.click();

      await expect(
        page.getByRole('heading', { name: /create api key/i }),
      ).toBeVisible();
      await expect(page.getByLabel(/description/i)).toBeVisible();
      await expect(
        page.getByRole('button', { name: /^create$/i }),
      ).toBeVisible();
      return;
    }

    await expect(newKeyButton).toBeDisabled();
  });
});
