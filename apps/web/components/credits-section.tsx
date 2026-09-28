'use client';

import type { JwtPayload } from '@supabase/supabase-js';
import { useQuery } from '@tanstack/react-query';
import { Crisp } from 'crisp-sdk-web';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { isCreditBalance } from '@/lib/credit-balance';
import type { Locale } from '@/lib/i18n/i18n-config';
import { Link } from '@/lib/i18n/navigation';
import { initPostHog } from '@/lib/posthog-browser';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import useSupabaseBrowser from '@/lib/supabase/client';
import { CREDITS_PER_MINUTE } from '@/lib/supabase/constants';
import { getCredits, hasUserPaid } from '@/lib/supabase/queries.client';
import { CreditBalanceError } from './credit-balance-error';
import { Button } from './ui/button';
import { ProgressCircle } from './ui/circular-progress';
import { useSidebar } from './ui/sidebar';
import { Skeleton } from './ui/skeleton';

function CreditsSection({
  lang,
  userId,
  creditTransactions,
  doNotToggleSidebar,
  showMinutes,
}: {
  lang: Locale;
  userId: string;
  creditTransactions: Pick<Tables<'credit_transactions'>, 'amount'>[] | null;
  doNotToggleSidebar?: boolean;
  showMinutes?: boolean;
}) {
  const t = useTranslations('creditsSection');
  const supabase = useSupabaseBrowser();
  const { isMobile, toggleSidebar } = useSidebar();
  const totalCredits =
    creditTransactions?.reduce(
      (total, transaction) => total + transaction.amount,
      0,
    ) || 0;

  const {
    data: creditsData,
    isPending,
    isError,
  } = useQuery({
    enabled: !!userId,
    queryFn: () => getCredits(supabase, userId),
    queryKey: ['credits', userId],
    retry: false,
  });

  useEffect(() => {
    if (isError || !isCreditBalance(creditsData?.amount)) {
      return;
    }

    const getData = async () => {
      const claims = await getVerifiedClaims(supabase);
      if (!claims?.sub) {
        throw new Error('User not found');
      }

      const userHasPaid = await hasUserPaid(supabase, claims.sub);
      return { claims, userHasPaid };
    };

    const sendUserAnalyticsData = (
      claims: JwtPayload,
      credits: Pick<Tables<'credits'>, 'amount'> | null | undefined,
      userHasPaid: boolean,
    ) => {
      const creditsLeft = credits?.amount ?? -1;
      const metadata = claims.user_metadata;
      const nickname =
        (typeof metadata?.full_name === 'string' && metadata.full_name) ||
        (typeof metadata?.username === 'string' && metadata.username) ||
        undefined;

      initPostHog()
        .then((posthog) => {
          posthog?.identify(claims.sub, {
            creditsLeft,
            email: claims.email,
            name: nickname,
            userHasPaid,
          });
        })
        .catch(() => undefined);

      if (!process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
        return;
      }

      Crisp.configure(process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID, {
        locale: lang,
      });

      if (claims.email) {
        Crisp.user.setEmail(claims.email);
      }

      if (nickname) {
        Crisp.user.setNickname(nickname);
      }

      Crisp.session.setData({
        creditsLeft,
        user_id: claims.sub,
        userHasPaid,
      });
    };

    getData()
      .then(({ claims, userHasPaid }) => {
        sendUserAnalyticsData(claims, creditsData, userHasPaid);
      })
      .catch((error) => {
        console.error('Failed to initialize dashboard layout:', error);
      });
  }, [creditsData, isError, lang, supabase]);

  if (isPending && userId) {
    return (
      <Skeleton
        className="h-[150px] w-full rounded-lg group-data-[collapsible=icon]:hidden"
        data-visual-test-no-radius
      />
    );
  }

  if (isError || !isCreditBalance(creditsData?.amount)) {
    return (
      <div className="group-data-[collapsible=icon]:hidden">
        <CreditBalanceError />
      </div>
    );
  }

  const minutesRemaining = Math.floor(
    Math.max(0, creditsData.amount) / CREDITS_PER_MINUTE,
  );

  return (
    <div
      className="overflow-hidden rounded-lg bg-secondary px-4 py-2 text-white transition-all group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:p-0"
      data-testid="credits-section"
      data-visual-test-no-radius
    >
      <div className="mb-4 flex w-min-50 items-center justify-between">
        <div className="flex items-center">
          <span className="whitespace-nowrap text-gray-200 text-xs">
            {t('title')}
          </span>
        </div>
        <Button
          asChild
          className="bg-linear-to-r from-blue-400 to-purple-500 bg-clip-text pr-0 text-transparent hover:no-underline"
          size="sm"
          variant="link"
        >
          <Link
            href="/dashboard/credits"
            onClick={() => {
              if (isMobile && !doNotToggleSidebar) {
                toggleSidebar?.();
              }
            }}
          >
            {t('topupButton')}
          </Link>
        </Button>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-200">{t('totalCredits')}</span>
            <span className="font-medium" data-visual-test="transparent">
              {totalCredits.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-200">{t('remainingCredits')}</span>
            <span className="font-medium" data-visual-test="transparent">
              {creditsData.amount.toLocaleString()}
            </span>
          </div>
          {showMinutes && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-200">{t('remainingTime')}</span>
              <span className="font-medium" data-visual-test="transparent">
                ~{minutesRemaining.toLocaleString()} min
              </span>
            </div>
          )}
        </div>

        <div className="relative h-10 w-10" data-testid="credits-progress">
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
