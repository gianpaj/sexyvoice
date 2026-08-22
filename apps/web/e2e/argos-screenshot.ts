import {
  type ArgosScreenshotOptions,
  argosScreenshot as captureArgosScreenshot,
} from '@argos-ci/playwright';
import type { Page } from '@playwright/test';

export async function argosScreenshot(
  page: Page,
  name: string,
  options?: ArgosScreenshotOptions,
) {
  // Argos captures full-page screenshots. Reset scroll so fixed elements such
  // as the dashboard sidebar and toasts stay at consistent document positions.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(
    () => window.scrollX === 0 && window.scrollY === 0,
  );

  return captureArgosScreenshot(page, name, options);
}
