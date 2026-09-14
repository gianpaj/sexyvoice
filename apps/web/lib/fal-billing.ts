import { logger } from '@sentry/nextjs';

import { fetchWithRetry } from '@/lib/fetch-with-retry';
import { getProviderErrorMessage } from '@/lib/provider-errors';

export async function getFalBillingEventCost(
  requestId: string,
): Promise<number | null> {
  const adminKey = process.env.FAL_ADMIN_KEY;
  if (!adminKey) {
    return null;
  }

  try {
    return await fetchWithRetry(
      `https://api.fal.ai/v1/models/billing-events?request_id=${encodeURIComponent(requestId)}`,
      {
        parseResponse: async (response) => {
          const data = (await response.json()) as {
            billing_events?: { cost_estimate_nano_usd?: number }[];
          } | null;
          // Assumes one billing event per request_id; Fal may return multiple for retries.
          const nanoUsd = data?.billing_events?.[0]?.cost_estimate_nano_usd;

          if (
            typeof nanoUsd !== 'number' ||
            !Number.isFinite(nanoUsd) ||
            nanoUsd < 0
          ) {
            throw new Error(
              'Fal billing events API returned unexpected cost data',
            );
          }

          return nanoUsd / 1_000_000_000;
        },
        requestInit: {
          cache: 'no-store',
          headers: { Authorization: `Key ${adminKey}` },
        },
      },
    );
  } catch (err) {
    logger.warn('Failed to fetch Fal billing event cost after retries', {
      extra: { errorMessage: getProviderErrorMessage(err), requestId },
    });
    return null;
  }
}
