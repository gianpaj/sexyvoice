// Plain constants safe to import from any context (RSC, client, Playwright
// tests). Server-only state and mock data live in `./e2e-mocks.ts`.
export const E2E_USER_ID = 'e2e-test-user-id';

// Single source of truth for the E2E usage-summary numbers. The server-side
// summary cards (`./e2e-mocks.ts`) and the client-side data-table mock
// (`e2e/mocks/usage.mock.ts`) both build from these so they can never drift
// apart and make the screenshot disagree with the table. The server side adds
// zero-count `api_*` entries (required by its `Record<UsageSourceType>` type;
// `SummaryCard` filters out count === 0, so they never render).
export const E2E_MONTHLY_USAGE_SUMMARY_VALUES = {
  totalCredits: 121,
  totalOperations: 5,
  bySourceType: {
    tts: { credits: 36, count: 2 },
    voice_cloning: { credits: 50, count: 1 },
    live_call: { credits: 30, count: 1 },
    audio_processing: { credits: 5, count: 1 },
  },
};

export const E2E_ALL_TIME_USAGE_SUMMARY_VALUES = {
  totalCredits: 542,
  totalOperations: 23,
  bySourceType: {
    tts: { credits: 250, count: 12 },
    voice_cloning: { credits: 150, count: 3 },
    live_call: { credits: 120, count: 6 },
    audio_processing: { credits: 22, count: 2 },
  },
};
