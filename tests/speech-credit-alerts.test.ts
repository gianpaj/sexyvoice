import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  maybeSendSpeechCreditAllowanceAlert,
  resolveThreshold,
} from '@/lib/api/speech-credit-alerts';
import { emitCreditAllowanceThresholdReachedEvent } from '@/lib/notifications/events';
import { getLatestCreditAllowanceTransactionAdmin } from '@/lib/supabase/queries';

vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/notifications/events');

describe('maybeSendSpeechCreditAllowanceAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLatestCreditAllowanceTransactionAdmin).mockResolvedValue({
      id: 'txn_1',
      amount: 1000,
    });
    vi.mocked(emitCreditAllowanceThresholdReachedEvent).mockResolvedValue(
      undefined,
    );
  });

  it('resolves thresholds correctly', () => {
    expect(resolveThreshold(1000, 200)).toBe(80);
    expect(resolveThreshold(1000, 50)).toBe(95);
    expect(resolveThreshold(1000, 0)).toBe(100);
    expect(resolveThreshold(1000, 500)).toBeNull();
  });

  it('emits an event at 80% consumption', async () => {
    await maybeSendSpeechCreditAllowanceAlert({
      userId: 'user_1',
      creditsRemaining: 200,
    });

    expect(emitCreditAllowanceThresholdReachedEvent).toHaveBeenCalledWith({
      userId: 'user_1',
      creditTransactionId: 'txn_1',
      thresholdPercent: 80,
      creditsRemaining: 200,
      allowanceAmount: 1000,
    });
  });

  it('does not emit an event when no threshold is reached', async () => {
    await maybeSendSpeechCreditAllowanceAlert({
      userId: 'user_1',
      creditsRemaining: 600,
    });

    expect(emitCreditAllowanceThresholdReachedEvent).not.toHaveBeenCalled();
  });

  it('does not emit an event when the user has no allowance transaction', async () => {
    vi.mocked(getLatestCreditAllowanceTransactionAdmin).mockResolvedValue(null);

    await maybeSendSpeechCreditAllowanceAlert({
      userId: 'user_1',
      creditsRemaining: 0,
    });

    expect(emitCreditAllowanceThresholdReachedEvent).not.toHaveBeenCalled();
  });
});
