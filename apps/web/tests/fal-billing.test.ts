import { logger } from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getFalBillingEventCost } from '@/lib/fal-billing';

const fetchMock = vi.fn<typeof fetch>();

describe('getFalBillingEventCost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('FAL_ADMIN_KEY', 'test-admin-key');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns null without fetching when the admin key is missing', async () => {
    vi.stubEnv('FAL_ADMIN_KEY', '');
    await expect(getFalBillingEventCost('request-id')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([0, 12_000_000])(
    'converts a valid cost of %s nano USD without retries',
    async (cost) => {
      fetchMock.mockResolvedValue(
        Response.json({ billing_events: [{ cost_estimate_nano_usd: cost }] }),
      );
      await expect(getFalBillingEventCost('request/id')).resolves.toBe(
        cost / 1_000_000_000,
      );
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        'https://api.fal.ai/v1/models/billing-events?request_id=request%2Fid',
        {
          cache: 'no-store',
          headers: { Authorization: 'Key test-admin-key' },
          signal: expect.any(AbortSignal),
        },
      );
      expect(logger.warn).not.toHaveBeenCalled();
    },
  );

  it('waits for billing data and succeeds on the fourth attempt without warnings', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ billing_events: [] }))
      .mockResolvedValueOnce(Response.json({ billing_events: [] }))
      .mockResolvedValueOnce(Response.json({ billing_events: [] }))
      .mockResolvedValueOnce(
        Response.json({
          billing_events: [{ cost_estimate_nano_usd: 12_000_000 }],
        }),
      );
    const result = getFalBillingEventCost('request-id');

    await vi.advanceTimersByTimeAsync(7000);
    await expect(result).resolves.toBe(0.012);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { billing_events: [] },
    { billing_events: [{}] },
    { billing_events: [{ cost_estimate_nano_usd: -1 }] },
    { billing_events: [{ cost_estimate_nano_usd: '1000' }] },
  ])(
    'returns null and warns once after exhausting invalid cost responses: %j',
    async (data) => {
      fetchMock.mockImplementation(async () => Response.json(data));
      const result = getFalBillingEventCost('request-id');

      await vi.advanceTimersByTimeAsync(6999);
      expect(logger.warn).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
        'Failed to fetch Fal billing event cost after retries',
        {
          extra: {
            errorMessage:
              'Fal billing events API returned unexpected cost data',
            requestId: 'request-id',
          },
        },
      );
    },
  );

  it('returns null and warns once after repeated network failures', async () => {
    fetchMock.mockRejectedValue(new Error('Network unavailable'));
    const result = getFalBillingEventCost('request-id');
    await vi.advanceTimersByTimeAsync(7000);
    await expect(result).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
