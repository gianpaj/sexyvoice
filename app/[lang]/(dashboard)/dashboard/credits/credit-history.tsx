import { format } from 'date-fns';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type lang from '@/lib/i18n/dictionaries/en.json';

export function CreditHistory({
  dict,
  transactions,
}: {
  dict: (typeof lang)['credits'];
  transactions:
    | Pick<
        Tables<'credit_transactions'>,
        'id' | 'created_at' | 'description' | 'type' | 'amount'
      >[]
    | null;
}) {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="rounded-lg py-8 text-center">
        <h4 className="mb-2 font-semibold text-sm">No transactions yet</h4>
        <p className="text-muted-foreground text-sm">{dict.historyEmpty}</p>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-lg border">
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
              </TableCell>
              <TableCell>{transaction.description}</TableCell>
              <TableCell className="capitalize">{transaction.type}</TableCell>
              <TableCell
                className={`text-right ${
                  ['purchase', 'freemium', 'topup'].includes(transaction.type)
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {Number(transaction.amount) > 0 ? '+' : '-'}
                {Math.abs(Number(transaction.amount))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
