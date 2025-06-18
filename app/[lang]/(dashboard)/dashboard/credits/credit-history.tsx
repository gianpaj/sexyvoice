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

// interface StripeTransaction {
//   id: string;
//   amount: number;
//   type: string;
//   description: string;
//   created: number;
//   status: string;
//   current_period_end?: number;
//   current_period_start?: number;
//   invoice_id?: string;
// }

export function CreditHistory({
  dict,
  transactions,
}: {
  dict: (typeof lang)['credits'];
  transactions: CreditTransaction[] | null;
}) {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="rounded-lg py-8 text-center">
        <h4 className="mb-2 text-sm font-semibold">No transactions yet</h4>
        <p className="text-sm text-muted-foreground">{dict.historyEmpty}</p>
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
                  ['purchase', 'freemium', 'topup'].includes(transaction.type)
                    ? // || transaction.type === 'subscription'
                      'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {['purchase', 'freemium', 'topup'].includes(transaction.type)
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
