import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  insertSubscriptionCreditTransaction,
  insertTopupCreditTransaction,
  isCreditTransactionReferenceConflict,
} from '@/lib/supabase/queries';

describe('credit transaction reference conflicts', () => {
  it('recognizes reference conflicts reported in PostgREST details', () => {
    expect(
      isCreditTransactionReferenceConflict({
        code: '23505',
        details: 'Key (reference_id)=(pi_123) already exists.',
        message: 'duplicate key value violates unique constraint',
      }),
    ).toBe(true);
  });

  it('ignores unrelated unique constraint violations', () => {
    expect(
      isCreditTransactionReferenceConflict({
        code: '23505',
        details: 'Key (email)=(person@example.com) already exists.',
        message:
          'duplicate key value violates unique constraint users_email_key',
      }),
    ).toBe(false);
  });
});

interface PreCheckResult {
  data: { id: string } | null;
  error: { message: string } | null;
}

function createCreditTransactionsStub(preCheck: PreCheckResult) {
  const maybeSingle = vi.fn().mockResolvedValue(preCheck);
  const single = vi.fn();
  const limit = vi.fn().mockResolvedValue({ data: [], error: null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const query = {
    eq: vi.fn(),
    limit,
    maybeSingle,
    select: vi.fn(),
    single,
  };
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);

  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn(() => ({ ...query, insert }));

  vi.mocked(createAdminClient).mockReturnValue({ from, rpc } as never);

  return { insert, maybeSingle, rpc, single };
}

const grants = [
  {
    grant: () =>
      insertTopupCreditTransaction('user-1', 'pi_123', 500, 5, 'starter'),
    name: 'insertTopupCreditTransaction',
  },
  {
    grant: () =>
      insertSubscriptionCreditTransaction('user-1', 'pi_123', 'sub_1', 500, 5),
    name: 'insertSubscriptionCreditTransaction',
  },
];

describe.each(grants)('$name duplicate pre-check', ({ grant }) => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses maybeSingle and grants credits when no prior transaction exists', async () => {
    const stub = createCreditTransactionsStub({ data: null, error: null });

    await grant();

    expect(stub.maybeSingle).toHaveBeenCalledTimes(1);
    expect(stub.single).not.toHaveBeenCalled();
    expect(stub.insert).toHaveBeenCalledWith(
      expect.objectContaining({ reference_id: 'pi_123', user_id: 'user-1' }),
    );
    expect(stub.rpc).toHaveBeenCalledWith('increment_user_credits', {
      credit_amount_var: 500,
      user_id_var: 'user-1',
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  it('skips the grant when a transaction already exists', async () => {
    const stub = createCreditTransactionsStub({
      data: { id: 'tx-1' },
      error: null,
    });

    await grant();

    expect(stub.insert).not.toHaveBeenCalled();
    expect(stub.rpc).not.toHaveBeenCalled();
  });

  it('logs a pre-check error and still grants credits', async () => {
    const stub = createCreditTransactionsStub({
      data: null,
      error: { message: 'upstream unavailable' },
    });

    await grant();

    expect(console.error).toHaveBeenCalledWith(
      'Error checking existing credit transaction:',
      expect.objectContaining({
        error: 'upstream unavailable',
        referenceId: 'pi_123',
        userId: 'user-1',
      }),
    );
    expect(stub.insert).toHaveBeenCalledTimes(1);
    expect(stub.rpc).toHaveBeenCalledTimes(1);
  });
});
