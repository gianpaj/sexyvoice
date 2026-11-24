import { expect, test } from '@playwright/test';

import { i18n } from '../lib/i18n/i18n-config';
import { argosScreenshot } from './argos-screenshot';
import { waitForHydration } from './wait-for-hydration';

test.use({ storageState: { cookies: [], origins: [] } });

for (const locale of i18n.locales) {
  test.describe(locale, () => {
    test.use({ locale });

    test('captures the landing page', async ({ page }, testInfo) => {
      await page.goto(`/${locale}`);

      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await waitForHydration(page, 'footer');

      await argosScreenshot(
        page,
        `landing-page-${locale}-${testInfo.project.name}`,
        {
          // The bottom CTA fades in on scroll. Capture its settled appearance.
          argosCSS:
            '[data-fade-in] { opacity: 1 !important; filter: none !important; transform: none !important; }',
          fullPage: true,
        },
      );
    });
  });
}
