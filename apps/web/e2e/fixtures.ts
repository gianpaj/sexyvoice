import { test as base } from '@playwright/test';

import { handleAudioFiles } from './mocks/history.mock';

// Extend the base test with an auto-use fixture that stubs all live-data
// Supabase/API calls so Argos screenshots are deterministic across runs.
export const test = base.extend({
  page: async ({ page }, use) => {
    // credits table — ProgressCircle renders at a fixed 50% (5 000 / 10 000)
    await page.route('**/rest/v1/credits*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ amount: 5000 }),
      }),
    );

    // audio_files — history DataTable (client-side React Query refetch)
    await page.route('**/rest/v1/audio_files*', handleAudioFiles);

    await use(page);
  },
});

export { expect } from '@playwright/test';
