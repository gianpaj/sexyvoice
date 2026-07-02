import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  computeCardBonusEligibility,
  insertCardBonusCreditTransaction,
} from '@/lib/supabase/queries';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

interface AdminMockOptions {
  claimError?: { code: string; message?: string } | null;
  existingBonusData?: { id: string } | null;
  existingError?: { message: string } | null;
  insertError?: { code: string; message?: string } | null;
  rpcError?: { message: string } | null;
}

function makeAdminMock({
  claimError = null,
  existingBonusData = null,
  existingError = null,
  insertError = null,
  rpcError = null,
}: AdminMockOptions = {}) {
  const claimsInsert = vi.fn().mockResolvedValue({ error: claimError });
  const transactionsInsert = vi.fn().mockResolvedValue({ error: insertError });
  const rpc = vi.fn().mockResolvedValue({ data: null, error: rpcError });

  const from = vi.fn((table: string) => {
    if (table === 'card_bonus_claims') {
      return { insert: claimsInsert };
    }

    // credit_transactions
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: existingBonusData, error: existingError }),
      insert: transactionsInsert,
    };
  });

  return { claimsInsert, from, rpc, transactionsInsert };
}

describe('insertCardBonusCreditTransaction()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grants the bonus on a fresh claim', async () => {
    const admin = makeAdminMock();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await insertCardBonusCreditTransaction(
      'user_123',
      'seti_123',
      'fp_abc',
      9000,
    );

    expect(admin.claimsInsert).toHaveBeenCalledWith({
      fingerprint: 'fp_abc',
      user_id: 'user_123',
      setup_intent_id: 'seti_123',
    });
    expect(admin.transactionsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user_123',
        amount: 9000,
        type: 'card_bonus',
        reference_id: 'seti_123',
        metadata: { fingerprint: 'fp_abc' },
      }),
    );
    expect(admin.rpc).toHaveBeenCalledWith('increment_user_credits', {
      user_id_var: 'user_123',
      credit_amount_var: 9000,
    });
  });

  it('skips the grant when the card fingerprint was already claimed', async () => {
    const admin = makeAdminMock({
      claimError: { code: '23505', message: 'duplicate key value' },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await insertCardBonusCreditTransaction('user_123', 'seti_123', 'fp_abc');

    expect(admin.claimsInsert).toHaveBeenCalled();
    expect(admin.transactionsInsert).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('skips the grant when the user already has a card_bonus transaction', async () => {
    const admin = makeAdminMock({
      existingBonusData: { id: 'existing-tx-id' },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await insertCardBonusCreditTransaction('user_123', 'seti_456', 'fp_def');

    expect(admin.transactionsInsert).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('still grants the bonus when the existing-transaction lookup errors', async () => {
    // A transient read failure on the best-effort dedup lookup must not strand
    // the grant — the partial unique index on the insert is the real guard.
    const admin = makeAdminMock({
      existingError: { message: 'connection reset' },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await insertCardBonusCreditTransaction('user_123', 'seti_read', 'fp_read');

    expect(admin.transactionsInsert).toHaveBeenCalled();
    expect(admin.rpc).toHaveBeenCalled();
  });

  it('skips the grant when the per-user unique index rejects the insert', async () => {
    const admin = makeAdminMock({
      insertError: { code: '23505', message: 'duplicate key value' },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await insertCardBonusCreditTransaction('user_123', 'seti_789', 'fp_ghi');

    expect(admin.transactionsInsert).toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('rethrows unexpected errors from the claims insert', async () => {
    const admin = makeAdminMock({
      claimError: { code: '23503', message: 'foreign key violation' },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await expect(
      insertCardBonusCreditTransaction('user_123', 'seti_err', 'fp_err'),
    ).rejects.toMatchObject({ code: '23503' });

    expect(admin.transactionsInsert).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('rethrows unexpected errors from the credit_transactions insert', async () => {
    const admin = makeAdminMock({
      insertError: { code: '23514', message: 'check constraint violation' },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    await expect(
      insertCardBonusCreditTransaction('user_123', 'seti_err2', 'fp_err2'),
    ).rejects.toMatchObject({ code: '23514' });

    expect(admin.rpc).not.toHaveBeenCalled();
  });
});

describe('computeCardBonusEligibility()', () => {
  it('is eligible with exactly one 1,000-credit freemium row and nothing else', () => {
    expect(
      computeCardBonusEligibility([{ type: 'freemium', amount: 1000 }]),
    ).toBe(true);
  });

  it('is not eligible for legacy 10,000-credit freemium users', () => {
    expect(
      computeCardBonusEligibility([{ type: 'freemium', amount: 10_000 }]),
    ).toBe(false);
  });

  it('is not eligible once the bonus was already claimed', () => {
    expect(
      computeCardBonusEligibility([
        { type: 'freemium', amount: 1000 },
        { type: 'card_bonus', amount: 9000 },
      ]),
    ).toBe(false);
  });

  it('is not eligible for users who have paid (topup)', () => {
    expect(
      computeCardBonusEligibility([
        { type: 'freemium', amount: 1000 },
        { type: 'topup', amount: 5000 },
      ]),
    ).toBe(false);
  });

  it('is not eligible for users who have paid (purchase)', () => {
    expect(
      computeCardBonusEligibility([
        { type: 'freemium', amount: 1000 },
        { type: 'purchase', amount: 25_000 },
      ]),
    ).toBe(false);
  });

  it('is not eligible without any freemium row', () => {
    expect(computeCardBonusEligibility([])).toBe(false);
  });
});
