import { beforeEach, describe, expect, it, vi } from 'vitest';

import { reserveCredits } from '@/lib/credits/reservation';
import {
  reduceCredits,
  reduceCreditsAdmin,
  reduceCreditsUpTo,
  reduceCreditsUpToAdmin,
  restoreCredits,
} from '@/lib/supabase/queries';

const userId = 'user-1';

describe('reserveCredits', () => {
  beforeEach(() => {
    vi.mocked(reduceCredits).mockClear();
    vi.mocked(reduceCreditsAdmin).mockClear();
    vi.mocked(reduceCreditsUpTo).mockClear();
    vi.mocked(reduceCreditsUpToAdmin).mockClear();
    vi.mocked(restoreCredits).mockReset().mockResolvedValue(undefined);
  });

  it('debits as the session or the service role', async () => {
    await reserveCredits({ actor: 'session', amount: 100, userId });
    await reserveCredits({ actor: 'service', amount: 50, userId });

    expect(reduceCredits).toHaveBeenCalledWith({ amount: 100, userId });
    expect(reduceCreditsAdmin).toHaveBeenCalledWith({ amount: 50, userId });
  });

  it('refunds the unused part of the reservation', async () => {
    const reservation = await reserveCredits({
      actor: 'session',
      amount: 100,
      userId,
    });

    await expect(reservation.settle(60, 'success')).resolves.toEqual({
      debited: 60,
      outcome: 'refunded',
    });
    expect(restoreCredits).toHaveBeenCalledWith({ amount: 40, userId });
  });

  it('debits extra credits up to the balance', async () => {
    vi.mocked(reduceCreditsUpTo).mockResolvedValueOnce(15);
    const reservation = await reserveCredits({
      actor: 'session',
      amount: 100,
      userId,
    });

    await expect(reservation.settle(130, 'success')).resolves.toEqual({
      debited: 115,
      outcome: 'partial_debit',
    });
    expect(reduceCreditsUpTo).toHaveBeenCalledWith({ amount: 30, userId });
  });

  it('keeps the charge when the refund fails', async () => {
    vi.mocked(restoreCredits).mockRejectedValueOnce(new Error('rpc down'));
    const reservation = await reserveCredits({
      actor: 'service',
      amount: 100,
      userId,
    });

    await expect(reservation.settle(60, 'success')).resolves.toEqual({
      debited: 100,
      error: 'rpc down',
      outcome: 'refund_failed',
    });
  });

  it('releases part of the hold and then the rest', async () => {
    const reservation = await reserveCredits({
      actor: 'session',
      amount: 100,
      userId,
    });

    await reservation.release('fallback', 30);
    expect(reservation.held).toBe(70);
    await reservation.release('failure');

    expect(restoreCredits).toHaveBeenNthCalledWith(1, { amount: 30, userId });
    expect(restoreCredits).toHaveBeenNthCalledWith(2, { amount: 70, userId });
    expect(reservation.held).toBe(0);
  });

  it('refunds nothing once settled', async () => {
    const reservation = await reserveCredits({
      actor: 'session',
      amount: 100,
      userId,
    });

    await reservation.settle(100, 'success');
    await expect(reservation.release('failure')).resolves.toEqual({
      ok: true,
    });
    expect(restoreCredits).not.toHaveBeenCalled();
  });

  it('refuses a second settle instead of charging twice', async () => {
    const reservation = await reserveCredits({
      actor: 'session',
      amount: 100,
      userId,
    });

    await reservation.settle(100, 'success');
    await expect(reservation.settle(100, 'success')).rejects.toThrow(
      'already settled',
    );
    expect(reduceCreditsUpTo).not.toHaveBeenCalled();
  });
});
