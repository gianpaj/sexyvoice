'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/supabase';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';

interface CreditTransaction {
  id: string;
  amount: number;
  type: 'purchase' | 'usage';
  description: string;
  created_at: string;
}

export function CreditHistory({ userId }: { userId?: string }) {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadTransactions() {
      if (!userId) return;

      const { data } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        setTransactions(data);
      }
      setIsLoading(false);
    }

    loadTransactions();
  }, [userId, supabase]);

  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">Loading transaction history...</p>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-lg bg-gray-50 py-8 text-center">
        <h4 className="mb-2 text-sm font-semibold">No transactions yet</h4>
        <p className="text-sm text-muted-foreground">
          Your credit usage history will appear here
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
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
              </TableCell>
              <TableCell>{transaction.description}</TableCell>
              <TableCell className="capitalize">{transaction.type}</TableCell>
              <TableCell
                className={`text-right ${transaction.type === 'purchase' ? 'text-green-600' : 'text-red-600'}`}
              >
                {transaction.type === 'purchase' ? '+' : '-'}
                {transaction.amount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
