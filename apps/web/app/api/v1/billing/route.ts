import { withExternalApi } from '@/lib/api/handler';
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

export const GET = withExternalApi(
  '/api/v1/billing',
  async (_request, { auth, respond }) => {
    const admin = createAdminClient();

    const { data: creditsData, error: creditsError } = await admin
      .from('credits')
      .select('amount, updated_at')
      .eq('user_id', auth.userId)
      .maybeSingle();

    if (creditsError) {
      throw creditsError;
    }

    const { data: transactionData, error: transactionError } = await admin
      .from('credit_transactions')
      .select(
        'id, type, amount, description, created_at, reference_id, subscription_id, metadata',
      )
      .eq('user_id', auth.userId)
      .in('type', ['purchase', 'topup'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (transactionError) {
      throw transactionError;
    }

    const lastTransaction = (transactionData?.[0] ??
      null) as BillingTransaction | null;

    return respond(
      {
        creditsLeft: creditsData?.amount ?? 0,
        lastBillingTransaction: lastTransaction,
        lastUpdated: creditsData?.updated_at ?? null,
        userId: auth.userId,
      },
      { status: 200 },
    );
  },
  { serverErrorMessage: 'Failed to fetch billing balance' },
);
