'use client';

import type { User } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { Crisp } from 'crisp-sdk-web';
import Link from 'next/link';
import { usePostHog } from 'posthog-js/react';
import { useContext, useEffect } from 'react';

import type langDict from '@/lib/i18n/dictionaries/en.json';
import type { Locale } from '@/lib/i18n/i18n-config';
import useSupabaseBrowser from '@/lib/supabase/client';
import { hasUserPaid } from '@/lib/supabase/queries';
import { getCredits } from '@/lib/supabase/queries.client';
import { Button } from './ui/button';
import { ProgressCircle } from './ui/circular-progress';
import { SidebarContext } from './ui/sidebar';
import { Skeleton } from './ui/skeleton';

function CreditsSection({
  lang,
  dict,
  userId,
  creditTransactions,
  doNotToggleSidebar,
  showMinutes,
}: {
  lang: Locale;
  userId: string;
  dict: (typeof langDict)['creditsSection'];
  creditTransactions: Pick<Tables<'credit_transactions'>, 'amount'>[] | null;
  doNotToggleSidebar?: boolean;
  showMinutes?: boolean;
}) {
  const posthog = usePostHog();
  const supabase = useSupabaseBrowser();
  // Safely access the sidebar context without throwing an error
  const sidebarContext = useContext(SidebarContext);
  const isMobile = sidebarContext?.isMobile;
  const total_credits =
    creditTransactions?.reduce(
      (acc, transaction) => acc + transaction.amount,
      0,
    ) || 0;

  const { data: creditsData } = useQuery({
    queryKey: ['credits', userId],
    enabled: !!userId,
    // staleTime: 1 * 1000,
    queryFn: () => getCredits(supabase, userId),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: credits state dependency
  useEffect(() => {
    const getData = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) {
        throw new Error('User not found');
      }

      const userHasPaid = await hasUserPaid(user.id);

      return { user, userHasPaid };
    };

    const sendUserAnalyticsData = (
      user: User,
      creditsData: Pick<Tables<'credits'>, 'amount'> | null | undefined,
      userHasPaid: boolean,
    ) => {
      posthog.identify(user.id, {
        email: user.email,
        name: user.user_metadata.full_name || user.user_metadata.username,
        creditsLeft: creditsData?.amount || 0,
        userHasPaid,
      });
      if (!process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
        return;
      }
      Crisp.configure(process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID, {
        locale: lang,
      });
      if (user.email) {
        Crisp.user.setEmail(user.email);
      }
      const nickname =
        user.user_metadata.full_name || user.user_metadata.username;
      if (nickname) {
        Crisp.user.setNickname(nickname);
      }
      Crisp.session.setData({
        user_id: user.id,
        creditsLeft: creditsData?.amount || 0,
        userHasPaid,
      });
    };

    getData()
      .then(({ user, userHasPaid }) => {
        // console.log({ creditsData });
        sendUserAnalyticsData(user, creditsData, userHasPaid);
      })
      .catch((error) => {
        console.error('Failed to initialize dashboard layout:', error);
      });
  }, []);

  if (!creditsData) return <Skeleton className="h-[150px] w-full rounded-lg" />;

  const minutesRemaining = Math.floor(creditsData.amount / 200);

  return (
    <div className="overflow-hidden rounded-lg bg-secondary px-4 py-2 text-white transition-all group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:p-0">
      <div className="mb-4 flex w-50 items-center justify-between">
        <div className="flex items-center">
          <span className="whitespace-nowrap text-gray-200 text-xs">
            {dict.title}
          </span>
        </div>
        <Button
          asChild
          className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text pr-0 text-transparent hover:no-underline"
          size="sm"
          variant="link"
        >
          <Link
            href={`/${lang}/dashboard/credits`}
            onClick={() => {
              if (isMobile && !doNotToggleSidebar) {
                sidebarContext.toggleSidebar?.();
              }
            }}
          >
            {dict.topupButton}
          </Link>
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-200">{dict.totalCredits}</span>
            <span className="font-medium">
              {total_credits.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-200">{dict.remainingCredits}</span>
            <span className="font-medium">
              {creditsData.amount.toLocaleString()}
            </span>
          </div>

          {showMinutes && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-200">{dict.remainingTime}</span>
              <span className="font-medium">
                {`~${minutesRemaining.toLocaleString()} min`}
              </span>
            </div>
          )}
        </div>

        <div className="relative h-10 w-10">
          <ProgressCircle
            className="size-10"
            value={Math.round((creditsData.amount / 10_000) * 100)}
          />
        </div>
      </div>
    </div>
  );
}

export default CreditsSection;
