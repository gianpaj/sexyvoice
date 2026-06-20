// Mock data used when E2E_TEST_MODE=true so Argos screenshots are deterministic.
// Branched inside RSC data-fetching paths to avoid hitting real Stripe/Supabase.
// Marked server-only: isE2E() reads process.env, which Next.js silently inlines
// as `undefined` in client bundles, so any client import would both bloat the
// browser bundle and produce wrong results. The shared E2E_USER_ID constant
// lives in a separate file because Playwright tests (which run outside the
// Next.js bundler) need to import it.
import 'server-only';

import { E2E_USER_ID } from './e2e-mocks-shared';
import { isE2E as isE2EMode } from './e2e-mode';
import type { AudioFileAndVoicesRes } from './supabase/queries.client';
import type { MonthlyUsageSummary } from './supabase/usage-queries';

export const isE2E = isE2EMode;

type CreditTransactionRow = Tables<'credit_transactions'>;

export const E2E_CREDIT_TRANSACTIONS: CreditTransactionRow[] = [
  {
    id: 'txn-001',
    user_id: E2E_USER_ID,
    created_at: '2025-01-15T10:30:00.000Z',
    updated_at: '2025-01-15T10:30:00.000Z',
    description: 'Initial free credits',
    type: 'freemium',
    amount: 10_000,
    metadata: null,
    reference_id: null,
    subscription_id: null,
  },
  {
    id: 'txn-002',
    user_id: E2E_USER_ID,
    created_at: '2025-01-10T09:00:00.000Z',
    updated_at: '2025-01-10T09:00:00.000Z',
    description: 'Credit top-up - $10',
    type: 'topup',
    amount: 5000,
    metadata: null,
    reference_id: null,
    subscription_id: null,
  },
  {
    id: 'txn-003',
    user_id: E2E_USER_ID,
    created_at: '2025-01-05T14:00:00.000Z',
    updated_at: '2025-01-05T14:00:00.000Z',
    description: 'Subscription credits',
    type: 'purchase',
    amount: 12_000,
    metadata: null,
    reference_id: null,
    subscription_id: null,
  },
];

// Defense-in-depth: the env-var alone is too thin a gate, since a single
// mis-set Vercel env var would silently serve hardcoded mock credits to every
// signed-in user. The shared predicate is exported from `e2e-mode.ts` so server
// actions can use it in tests without importing this server-only mock data file.

// History page audio files. The history table is server-rendered and hydrated
// into React Query (the client never refetches), so the live Supabase rows show
// through even though `e2e/fixtures.ts` stubs the `/rest/v1/audio_files` route.
// Branching the RSC query on `isE2E()` is the only way to make the history
// screenshot deterministic. These mirror `e2e/mocks/history.mock.ts` so the
// client-side fixture (a defensive fallback) returns identical data.
export const E2E_AUDIO_FILES: AudioFileAndVoicesRes[] = [
  {
    id: 'file-001',
    user_id: E2E_USER_ID,
    storage_key: 'audio/test-hello-world.mp3',
    url: 'https://files.sexyvoice.ai/test-hello-world.mp3',
    text_content: 'Hello, this is a test message for voice generation.',
    status: 'active',
    created_at: '2025-01-15T10:30:00.000Z',
    deleted_at: null,
    duration: 3,
    is_public: false,
    model: 'gemini-2.5-flash-preview-tts',
    prediction_id: null,
    total_votes: 0,
    credits_used: 12,
    usage: null,
    voice_id: 'voice-001',
    voices: { name: 'Zephyr' } as AudioFileAndVoicesRes['voices'],
  },
  {
    id: 'file-002',
    user_id: E2E_USER_ID,
    storage_key: 'audio/test-another-message.mp3',
    url: 'https://files.sexyvoice.ai/test-another-message.mp3',
    text_content: 'Another test message for voice generation.',
    status: 'active',
    created_at: '2025-01-14T09:00:00.000Z',
    deleted_at: null,
    duration: 2,
    is_public: false,
    model: 'gemini-2.5-flash-preview-tts',
    prediction_id: null,
    total_votes: 0,
    credits_used: 8,
    usage: null,
    voice_id: 'voice-002',
    voices: { name: 'Poe' } as AudioFileAndVoicesRes['voices'],
  },
];

// Usage page summary cards are server-rendered (no client refetch), so — like
// the history table — they bypass the `/api/usage-events` route stub and must be
// mocked in the RSC path. Values mirror `e2e/mocks/usage.mock.ts`. `api_*` types
// carry zero counts so they are filtered out of the card (SummaryCard hides
// source types with count === 0), matching the four active types in the mock.
export const E2E_MONTHLY_USAGE_SUMMARY: MonthlyUsageSummary = {
  totalCredits: 121,
  totalOperations: 5,
  bySourceType: {
    tts: { credits: 36, count: 2 },
    voice_cloning: { credits: 50, count: 1 },
    live_call: { credits: 30, count: 1 },
    audio_processing: { credits: 5, count: 1 },
    api_tts: { credits: 0, count: 0 },
    api_voice_cloning: { credits: 0, count: 0 },
  },
};

export const E2E_ALL_TIME_USAGE_SUMMARY: MonthlyUsageSummary = {
  totalCredits: 542,
  totalOperations: 23,
  bySourceType: {
    tts: { credits: 250, count: 12 },
    voice_cloning: { credits: 150, count: 3 },
    live_call: { credits: 120, count: 6 },
    audio_processing: { credits: 22, count: 2 },
    api_tts: { credits: 0, count: 0 },
    api_voice_cloning: { credits: 0, count: 0 },
  },
};

// Pin the monthly card reference date so the screenshot is stable across calendar
// months (the page otherwise derives it from `new Date()`). The page formats this
// with `toLocaleDateString(lang, …)` so the label stays localized in E2E mode.
export const E2E_USAGE_REFERENCE_DATE = new Date('2025-01-15T10:30:00.000Z');
