import { captureException } from '@sentry/nextjs';

import { updateApiKeyLastUsed, validateApiKey } from '@/lib/api/auth';
import {
  externalApiErrorResponse,
  getExternalApiRequestId,
} from '@/lib/api/external-errors';
import { consumeRateLimit } from '@/lib/api/rate-limit';
import { jsonWithRateLimitHeaders } from '@/lib/api/responses';
import { createAdminClient } from '@/lib/supabase/admin';

type BillingTransactionType =
  Database['public']['Enums']['credit_transaction_type'];

interface BillingTransaction {
  amount: number;
  created_at: string;
  description: string;
  id: string;
  metadata: Json | null;
  reference_id: string | null;
  subscription_id: string | null;
  type: BillingTransactionType;
}

export async function GET(request: Request) {
  const requestId = getExternalApiRequestId();
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return externalApiErrorResponse({
      key: 'missing_authorization_header',
      requestId,
    });
  }

  const authResult = await validateApiKey(authHeader);
  if (!authResult) {
    return externalApiErrorResponse({
      key: 'invalid_api_key',
      requestId,
    });
  }

  const rateLimit = await consumeRateLimit(authResult.keyHash);
  if (!rateLimit.allowed) {
    return externalApiErrorResponse({
      key: 'rate_limit_exceeded',
      rateLimit,
      requestId,
    });
  }

  const admin = createAdminClient();

  try {
    const { data: creditsData, error: creditsError } = await admin
      .from('credits')
      .select('amount, updated_at')
      .eq('user_id', authResult.userId)
      .maybeSingle();

    if (creditsError) {
      throw creditsError;
    }

    const { data: transactionData, error: transactionError } = await admin
      .from('credit_transactions')
      .select(
        'id, type, amount, description, created_at, reference_id, subscription_id, metadata',
      )
      .eq('user_id', authResult.userId)
      .in('type', ['purchase', 'topup'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (transactionError) {
      throw transactionError;
    }

    const lastTransaction = (transactionData?.[0] ??
      null) as BillingTransaction | null;

    return jsonWithRateLimitHeaders(
      {
        creditsLeft: creditsData?.amount ?? 0,
        lastUpdated: creditsData?.updated_at ?? null,
        userId: authResult.userId,
        lastBillingTransaction: lastTransaction,
      },
      { status: 200 },
      rateLimit,
      requestId,
    );
  } catch (error) {
    captureException(error, {
      extra: {
        requestId,
        endpoint: '/api/v1/billing',
        userId: authResult.userId,
      },
    });
    return externalApiErrorResponse({
      key: 'server_error',
      message: 'Failed to fetch billing balance',
      rateLimit,
      requestId,
    });
  } finally {
    await updateApiKeyLastUsed(authResult.keyHash);
  }
}
