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
  bySourceType: {
    audio_processing: { count: 1, credits: 5 },
    live_call: { count: 1, credits: 30 },
    tts: { count: 2, credits: 36 },
    voice_cloning: { count: 1, credits: 50 },
  },
  totalCredits: 121,
  totalOperations: 5,
};

export const E2E_ALL_TIME_USAGE_SUMMARY_VALUES = {
  bySourceType: {
    audio_processing: { count: 2, credits: 22 },
    live_call: { count: 6, credits: 120 },
    tts: { count: 12, credits: 250 },
    voice_cloning: { count: 3, credits: 150 },
  },
  totalCredits: 542,
  totalOperations: 23,
};
