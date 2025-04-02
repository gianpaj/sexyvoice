'use client';

import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createClient } from '@/lib/supabase/client';

interface StripeTransaction {
  id: string;
  amount: number;
  type: string;
  description: string;
  created: number;
  status: string;
  current_period_end?: number;
  current_period_start?: number;
  invoice_id?: string;
}

export function CreditHistory({
  dict,
  userId,
}: {
  dict: any;
  userId?: string;
}) {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    async function loadTransactions() {
      if (!userId) return;

      setIsLoading(true);

      // First, get the stripe_id from the profiles table
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('stripe_id')
        .eq('id', userId)
        .single();

      // console.log({ profileData });

      // Fallback to local transactions if Stripe ID not available
      const { data } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) {
        setTransactions(data);
      }
      if (profileError || !profileData?.stripe_id) {
        console.error('Error fetching stripe_id:', profileError);

        console.log({ data });
        setIsLoading(false);
        return;
      }

      // try {
      //   // Fetch transactions from server endpoint that will call Stripe API
      //   const response = await fetch(
      //     `/api/stripe/transactions?stripeId=${profileData.stripe_id}`,
      //   );

      //   if (!response.ok) {
      //     throw new Error('Failed to fetch Stripe transactions');
      //   }

      //   const stripeTransactions = await response.json();

      //   // Transform Stripe data to match our CreditTransaction format
      //   const formattedTransactions = stripeTransactions.map(
      //     (item: StripeTransaction) => ({
      //       id: item.id,
      //       amount: item.amount / 100, // Stripe amounts are in cents
      //       type:
      //         item.type === 'payment'
      //           ? 'purchase'
      //           : item.type === 'subscription'
      //             ? 'subscription'
      //             : 'usage',
      //       description: item.description || 'Stripe transaction',
      //       created_at: new Date(item.created * 1000).toISOString(),
      //       status: item.status,
      //       current_period_end: item.current_period_end,
      //       current_period_start: item.current_period_start,
      //     }),
      //   );

      //   setTransactions(formattedTransactions);
      // } catch (error) {
      //   console.error('Error fetching Stripe transactions:', error);
      // }

      setIsLoading(false);
    }

    loadTransactions();
  }, [userId]);

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Loading transaction history...</p>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-lg py-8 text-center">
        <h4 className="mb-2 text-sm font-semibold">No transactions yet</h4>
        <p className="text-sm text-muted-foreground">
          {dict.credits.historyEmpty}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border mb-8">
      <Table>
        <TableHeader>
          <TableRow isHead>
            {/* TODO: translate */}
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell className="font-medium">
                {format(new Date(transaction.created_at), 'MMM d, yyyy')}
                {/* {transaction.type === 'purchase' &&
                  transaction.current_period_end && (
                    <div className="text-xs text-muted-foreground">
                      Renews:{' '}
                      {format(
                        new Date(transaction.current_period_end * 1000),
                        'MMM d, yyyy',
                      )}
                    </div>
                  )} */}
              </TableCell>
              <TableCell>{transaction.description}</TableCell>
              <TableCell className="capitalize">
                {transaction.type}
                {/* {transaction.status && transaction.status !== 'active' && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({transaction.status})
                  </span>
                )} */}
              </TableCell>
              <TableCell
                className={`text-right ${
                  ['purchase', 'freemium'].includes(transaction.type)
                    ? // || transaction.type === 'subscription'
                      'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {['purchase', 'freemium'].includes(transaction.type)
                  ? // || transaction.type === 'subscription'
                    '+'
                  : '-'}
                {transaction.amount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
