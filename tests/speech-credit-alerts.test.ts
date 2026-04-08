import { beforeEach, describe, expect, it, vi } from 'vitest';

import { maybeSendSpeechCreditAllowanceAlert } from '@/lib/api/speech-credit-alerts';
import { sendCreditAllowanceAlertEmail } from '@/lib/email/send-credit-allowance-alert-email';
import {
  getLatestCreditAllowanceTransactionAdmin,
  getUserEmailAdmin,
  markCreditAllowanceAlertEmailAdmin,
  reserveCreditAllowanceAlertEmailAdmin,
} from '@/lib/supabase/queries';

vi.mock('@/lib/supabase/queries');
vi.mock('@/lib/email/send-credit-allowance-alert-email');

describe('maybeSendSpeechCreditAllowanceAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLatestCreditAllowanceTransactionAdmin).mockResolvedValue({
      id: 'txn_1',
      amount: 1000,
    });
    vi.mocked(getUserEmailAdmin).mockResolvedValue('user@example.com');
    vi.mocked(reserveCreditAllowanceAlertEmailAdmin).mockResolvedValue(true);
    vi.mocked(sendCreditAllowanceAlertEmail).mockResolvedValue({
      sent: true,
      messageId: 'msg_1',
    });
    vi.mocked(markCreditAllowanceAlertEmailAdmin).mockResolvedValue(undefined);
  });

  it('sends an alert at 80% consumption', async () => {
    await maybeSendSpeechCreditAllowanceAlert({
      userId: 'user_1',
      creditsRemaining: 200,
    });

    expect(sendCreditAllowanceAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ thresholdPercent: 80 }),
    );
  });

  it('sends the highest threshold reached (100%)', async () => {
    await maybeSendSpeechCreditAllowanceAlert({
      userId: 'user_1',
      creditsRemaining: 0,
    });

    expect(sendCreditAllowanceAlertEmail).toHaveBeenCalledWith(
      expect.objectContaining({ thresholdPercent: 100 }),
    );
  });

  it('does not send if already reserved for the threshold', async () => {
    vi.mocked(reserveCreditAllowanceAlertEmailAdmin).mockResolvedValue(false);

    await maybeSendSpeechCreditAllowanceAlert({
      userId: 'user_1',
      creditsRemaining: 50,
    });

    expect(sendCreditAllowanceAlertEmail).not.toHaveBeenCalled();
  });
});
