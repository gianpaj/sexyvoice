import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  insertSubscriptionCreditTransaction,
  insertTopupCreditTransaction,
} from '@/lib/supabase/queries';

interface PreCheckResult {
  data: { id: string } | null;
  error: { message: string } | null;
}

function createCreditTransactionsStub(
  preCheck: PreCheckResult,
  {
    earlierPurchases = [],
    grantResult = { data: true, error: null },
  }: {
    earlierPurchases?: { id: string }[];
    grantResult?: { data: boolean | null; error: Error | null };
  } = {},
) {
  const maybeSingle = vi.fn().mockResolvedValue(preCheck);
  const single = vi.fn();
  const limit = vi.fn().mockResolvedValue({
    data: earlierPurchases,
    error: null,
  });
  const insert = vi.fn();
  const query = {
    eq: vi.fn(),
    limit,
    maybeSingle,
    select: vi.fn(),
    single,
  };
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);

  const rpc = vi.fn().mockResolvedValue(grantResult);
  const from = vi.fn(() => ({ ...query, insert }));

  vi.mocked(createAdminClient).mockReturnValue({ from, rpc } as never);

  return { eq: query.eq, insert, maybeSingle, rpc, single };
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

describe.each(grants)('$name', ({ grant }) => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses maybeSingle and grants credits in one call when no prior transaction exists', async () => {
    const stub = createCreditTransactionsStub({ data: null, error: null });

    await grant();

    expect(stub.maybeSingle).toHaveBeenCalledTimes(1);
    expect(stub.single).not.toHaveBeenCalled();
    expect(stub.insert).not.toHaveBeenCalled();
    expect(stub.rpc).toHaveBeenCalledExactlyOnceWith(
      'grant_purchased_credits',
      expect.objectContaining({
        p_amount: 500,
        p_reference_id: 'pi_123',
        p_user_id: 'user-1',
      }),
    );
    expect(console.error).not.toHaveBeenCalled();
  });

  it('skips the grant when a transaction already exists', async () => {
    const stub = createCreditTransactionsStub({
      data: { id: 'tx-1' },
      error: null,
    });

    await grant();

    expect(stub.eq.mock.calls).toEqual([
      ['user_id', 'user-1'],
      ['reference_id', 'pi_123'],
    ]);
    expect(stub.maybeSingle).toHaveBeenCalledTimes(1);
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
    expect(stub.rpc).toHaveBeenCalledTimes(1);
  });

  it('resolves when the database reports the payment as already granted', async () => {
    createCreditTransactionsStub(
      { data: null, error: null },
      { grantResult: { data: false, error: null } },
    );

    await expect(grant()).resolves.toBeUndefined();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/transaction already exists$/),
      expect.objectContaining({ paymentIntentId: 'pi_123', userId: 'user-1' }),
    );
  });

  it('throws when the grant fails so the webhook can retry', async () => {
    const error = new Error('increment failed');
    createCreditTransactionsStub(
      { data: null, error: null },
      { grantResult: { data: null, error } },
    );

    await expect(grant()).rejects.toBe(error);
  });
});

describe('credit purchase grant arguments', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records a first subscription payment with its bonus description', async () => {
    const stub = createCreditTransactionsStub({ data: null, error: null });

    await insertSubscriptionCreditTransaction(
      'user-1',
      'pi_123',
      'sub_1',
      500,
      5,
    );

    expect(stub.rpc).toHaveBeenCalledWith('grant_purchased_credits', {
      p_amount: 500,
      p_description: 'Subscription payment - $5 (includes 15% bonus)',
      p_metadata: { dollarAmount: 5, isFirstSubscription: true },
      p_reference_id: 'pi_123',
      p_subscription_id: 'sub_1',
      p_type: 'purchase',
      p_user_id: 'user-1',
    });
  });

  it('records a repeat top-up with its package and promo', async () => {
    const stub = createCreditTransactionsStub(
      { data: null, error: null },
      { earlierPurchases: [{ id: 'tx-0' }] },
    );

    await insertTopupCreditTransaction(
      'user-1',
      'pi_123',
      500,
      5,
      'starter',
      'halloween',
    );

    expect(stub.rpc).toHaveBeenCalledWith('grant_purchased_credits', {
      p_amount: 500,
      p_description: 'Credit top-up - $5',
      p_metadata: {
        dollarAmount: 5,
        isFirstTopup: false,
        packageId: 'starter',
        promo: 'halloween',
      },
      p_reference_id: 'pi_123',
      p_type: 'topup',
      p_user_id: 'user-1',
    });
  });
});
