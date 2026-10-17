// Mock data used when E2E_TEST_MODE=true so Argos screenshots are deterministic.
// Branched inside RSC data-fetching paths to avoid hitting real Stripe/Supabase.
// Marked server-only: isE2E() reads process.env, which Next.js silently inlines
// as `undefined` in client bundles, so any client import would both bloat the
// browser bundle and produce wrong results. The shared E2E_USER_ID constant
// lives in a separate file because Playwright tests (which run outside the
// Next.js bundler) need to import it.
import 'server-only';

import {
  E2E_ALL_TIME_USAGE_SUMMARY_VALUES,
  E2E_MONTHLY_USAGE_SUMMARY_VALUES,
  E2E_USER_ID,
} from './e2e-mocks-shared';
import { isE2E as isE2EMode } from './e2e-mode';
import type { getCallInstructionConfig } from './edge-config/call-instructions';
import type { getCallVoices } from './supabase/queries';
import type { AudioFileAndVoicesRes } from './supabase/queries.client';
import type { MonthlyUsageSummary } from './supabase/usage-queries';

export { E2E_PUBLIC_CALL_CHARACTERS } from './e2e-mocks-shared';

export const isE2E = isE2EMode;

// Public query fields captured from the linked database on 2026-09-18.
// No user IDs or prompt text; keep these snapshots independent of live data.
export const E2E_CALL_VOICES = [
  {
    description: 'Warm and friendly',
    feature: 'call',
    id: '76071f55-b9d5-4852-a96e-dbadb7b93e9e',
    language: 'multiple',
    model: 'xai',
    name: 'Ara',
    sample_url: 'https://files.sexyvoice.ai/ara.mp3',
    sort_order: 0,
    type: 'Female',
  },
  {
    description: 'Soft, empathetic, and soothing',
    feature: 'call',
    id: '23a09156-34dc-4454-8f73-9214c21f7f81',
    language: 'multiple',
    model: 'xai',
    name: 'Carina',
    sample_url: 'https://files.sexyvoice.ai/carina-intimate-whispers.mp3',
    sort_order: 0,
    type: 'Female',
  },
  {
    description: 'Confident and clear',
    feature: 'call',
    id: 'e580b7f2-1d13-4442-af3e-b1515425de47',
    language: 'multiple',
    model: 'xai',
    name: 'Rex',
    sample_url: 'https://files.sexyvoice.ai/rex.mp3',
    sort_order: 1,
    type: 'Male',
  },
  {
    description: 'Versatile voice',
    feature: 'call',
    id: '0d2f2652-858a-430e-8a4f-ce4b6c624474',
    language: 'multiple',
    model: 'xai',
    name: 'Sal',
    sample_url: 'https://files.sexyvoice.ai/sal.mp3',
    sort_order: 2,
    type: 'Neutral',
  },
  {
    description: 'Engaging and upbeat',
    feature: 'call',
    id: 'f832da16-5fe7-4823-9c99-b0f738e39b68',
    language: 'multiple',
    model: 'xai',
    name: 'Eve',
    sample_url: 'https://files.sexyvoice.ai/eve.mp3',
    sort_order: 3,
    type: 'Female',
  },
  {
    description: 'Authoritative and strong',
    feature: 'call',
    id: '7a22375b-5b5c-44d7-998c-6095cf60768b',
    language: 'multiple',
    model: 'xai',
    name: 'Leo',
    sample_url: 'https://files.sexyvoice.ai/leo-intimate-whispers.mp3',
    sort_order: 4,
    type: 'Male',
  },
] satisfies NonNullable<Awaited<ReturnType<typeof getCallVoices>>>;

export const E2E_CALL_INSTRUCTION_CONFIG = {
  defaultInstructions: 'Keep the conversation friendly and concise.',
  initialInstruction: 'Say hello.',
  presetInstructions: undefined,
} satisfies Awaited<ReturnType<typeof getCallInstructionConfig>>;

type CreditTransactionRow = Tables<'credit_transactions'>;

export const E2E_CREDIT_TRANSACTIONS: CreditTransactionRow[] = [
  {
    amount: 10_000,
    created_at: '2025-01-15T10:30:00.000Z',
    description: 'Initial free credits',
    id: 'txn-001',
    metadata: null,
    reference_id: null,
    subscription_id: null,
    type: 'freemium',
    updated_at: '2025-01-15T10:30:00.000Z',
    user_id: E2E_USER_ID,
  },
  {
    amount: 5000,
    created_at: '2025-01-10T09:00:00.000Z',
    description: 'Credit top-up - $10',
    id: 'txn-002',
    metadata: null,
    reference_id: null,
    subscription_id: null,
    type: 'topup',
    updated_at: '2025-01-10T09:00:00.000Z',
    user_id: E2E_USER_ID,
  },
  {
    amount: 12_000,
    created_at: '2025-01-05T14:00:00.000Z',
    description: 'Subscription credits',
    id: 'txn-003',
    metadata: null,
    reference_id: null,
    subscription_id: null,
    type: 'purchase',
    updated_at: '2025-01-05T14:00:00.000Z',
    user_id: E2E_USER_ID,
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
    created_at: '2025-01-15T10:30:00.000Z',
    credits_used: 12,
    deleted_at: null,
    duration: 3,
    id: 'file-001',
    is_public: false,
    model: 'gemini-2.5-flash-preview-tts',
    prediction_id: null,
    status: 'active',
    storage_key: 'audio/test-hello-world.mp3',
    text_content: 'Hello, this is a test message for voice generation.',
    total_votes: 0,
    url: 'https://files.sexyvoice.ai/test-hello-world.mp3',
    usage: null,
    user_id: E2E_USER_ID,
    voice_id: 'voice-001',
    voices: { name: 'Zephyr' } as AudioFileAndVoicesRes['voices'],
  },
  {
    created_at: '2025-01-14T09:00:00.000Z',
    credits_used: 8,
    deleted_at: null,
    duration: 2,
    id: 'file-002',
    is_public: false,
    model: 'gemini-2.5-flash-preview-tts',
    prediction_id: null,
    status: 'active',
    storage_key: 'audio/test-another-message.mp3',
    text_content: 'Another test message for voice generation.',
    total_votes: 0,
    url: 'https://files.sexyvoice.ai/test-another-message.mp3',
    usage: null,
    user_id: E2E_USER_ID,
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
  ...E2E_MONTHLY_USAGE_SUMMARY_VALUES,
  bySourceType: {
    ...E2E_MONTHLY_USAGE_SUMMARY_VALUES.bySourceType,
    api_tts: { count: 0, credits: 0 },
    api_voice_cloning: { count: 0, credits: 0 },
  },
};

export const E2E_ALL_TIME_USAGE_SUMMARY: MonthlyUsageSummary = {
  ...E2E_ALL_TIME_USAGE_SUMMARY_VALUES,
  bySourceType: {
    ...E2E_ALL_TIME_USAGE_SUMMARY_VALUES.bySourceType,
    api_tts: { count: 0, credits: 0 },
    api_voice_cloning: { count: 0, credits: 0 },
  },
};

// Pin the monthly card reference date so the screenshot is stable across calendar
// months (the page otherwise derives it from `new Date()`). The page formats this
// with `toLocaleDateString(lang, …)` so the label stays localized in E2E mode.
export const E2E_USAGE_REFERENCE_DATE = new Date('2025-01-15T10:30:00.000Z');
