'use client';

import { useTranslations } from 'next-intl';
import { useContext } from 'react';

import { Link } from '@/lib/i18n/navigation';
import { Button } from './ui/button';
import { ProgressCircle } from './ui/circular-progress';
import { SidebarContext } from './ui/sidebar';
import { Skeleton } from './ui/skeleton';

function CreditsSection({
  credits,
  credit_transactions,
  doNotToggleSidebar,
}: {
  credits?: number | null;
  credit_transactions: CreditTransaction[];
  doNotToggleSidebar?: boolean;
}) {
  const t = useTranslations('creditsSection');
  // Safely access the sidebar context without throwing an error
  const sidebarContext = useContext(SidebarContext);
  const isMobile = sidebarContext?.isMobile;
  const toggleSidebar = sidebarContext?.toggleSidebar || (() => {});
  const remainingCredits = credits ?? 0;
  const total_credits =
    credit_transactions?.reduce(
      (acc, transaction) => acc + transaction.amount,
      0,
    ) || 0;

  if (credits == null)
    return <Skeleton className="h-[150px] w-full rounded-lg" />;

  return (
    <div className="overflow-hidden rounded-lg bg-secondary px-4 py-2 text-white transition-all group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:p-0">
      <div className="mb-4 flex w-50 items-center justify-between">
        <div className="flex items-center">
          <span className="whitespace-nowrap text-gray-200 text-xs">
            {t('title')}
          </span>
        </div>
        <Button
          asChild
          className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text pr-0 text-transparent hover:no-underline"
          size="sm"
          variant="link"
        >
          <Link
            href="/dashboard/credits"
            onClick={() => {
              if (isMobile && !doNotToggleSidebar) {
                toggleSidebar();
              }
            }}
          >
            {t('topupButton')}
          </Link>
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-200">{t('totalCredits')}</span>
              <span className="font-medium">
                {total_credits.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-200">{t('remainingCredits')}</span>
              <span className="font-medium">
                {remainingCredits.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
        <div className="relative h-10 w-10">
          <ProgressCircle
            className="size-10"
            value={Math.round((remainingCredits / 10_000) * 100)}
          />
        </div>
      </div>
    </div>
  );
}

export default CreditsSection;
