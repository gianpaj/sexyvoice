'use client';

import type { JwtPayload } from '@supabase/supabase-js';
import { Crisp } from 'crisp-sdk-web';
import { useEffect } from 'react';

import { useCreditsQuery } from '@/hooks/use-credits-query';
import { isCreditBalance } from '@/lib/credit-balance';
import type { Locale } from '@/lib/i18n/i18n-config';
import { initPostHog } from '@/lib/posthog-browser';
import { getVerifiedClaims } from '@/lib/supabase/auth';
import useSupabaseBrowser from '@/lib/supabase/client';
import { hasUserPaid } from '@/lib/supabase/queries.client';

// Identifies the dashboard user to PostHog and Crisp, and resends the balance
// whenever it changes. `DashboardUI` renders this once, outside the sidebar,
// because the mobile sidebar unmounts while its drawer is closed.
export function DashboardAnalytics({
  lang,
  userId,
}: {
  lang: Locale;
  userId: string;
}) {
  const supabase = useSupabaseBrowser();
  const { data: creditsData, isError } = useCreditsQuery(userId);

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

  return null;
}
