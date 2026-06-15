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
