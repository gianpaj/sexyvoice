import Link from 'next/link';

import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Button } from './ui/button';
import { ProgressCircle } from './ui/circular-progress';
import { Skeleton } from './ui/skeleton';

function CreditsSection({
  lang,
  dict,
  credits,
  credit_transactions,
}: {
  lang: Locale;
  dict: (typeof langDict)['creditsSection'];
  credits: number;
  credit_transactions: CreditTransaction[];
}) {
  const total_credits =
    credit_transactions?.reduce(
      (acc, transaction) => acc + transaction.amount,
      0,
    ) || 0;

  if (!credits) return <Skeleton className="w-full h-[150px] rounded-lg" />;

  return (
    <div className="rounded-lg bg-secondary px-4 py-2 text-white group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:p-0 transition-all overflow-hidden">
      <div className="flex items-center justify-between mb-4 w-50">
        <div className="flex items-center">
          <span className="text-xs text-gray-200 whitespace-nowrap">
            {dict.title}
          </span>
        </div>
        <Button
          variant="link"
          size="sm"
          asChild
          className="pr-0 hover:no-underline bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent"
        >
          <Link href={`/${lang}/dashboard/credits`}>{dict.topupButton}</Link>
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center text-xs">
              <span className=" text-gray-200">{dict.totalCredits}</span>
              <span className=" font-medium">
                {total_credits.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className=" text-gray-200">{dict.remainingCredits}</span>
              <span className=" font-medium">{credits.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className="relative w-10 h-10">
          <ProgressCircle
            value={Math.round((credits / 10000) * 100)}
            className="size-10"
          />
        </div>
      </div>
    </div>
  );
}

export default CreditsSection;
