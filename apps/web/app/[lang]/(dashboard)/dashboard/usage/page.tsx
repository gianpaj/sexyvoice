import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import type { Locale } from '@/lib/i18n/i18n-config';
import { createClient } from '@/lib/supabase/server';
import {
  getAllTimeUsageSummary,
  getMonthlyUsageSummary,
  type UsageSourceType,
} from '@/lib/supabase/usage-queries';
import { DataTable } from './data-table';
import { SummaryCard } from './summary-card';

export default async function UsagePage(props: {
  params: Promise<{ lang: Locale }>;
}) {
  const { lang } = await props.params;
  const t = await getTranslations({ locale: lang, namespace: 'usage' });

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Fetch summary data server-side for initial render
  const [monthlySummary, allTimeSummary] = await Promise.all([
    getMonthlyUsageSummary(supabase, user.id),
    getAllTimeUsageSummary(supabase, user.id),
  ]);

  // Get month name for display
  const currentMonth = new Date().toLocaleDateString(lang, {
    month: 'long',
    year: 'numeric',
  });

  // Source type labels for display
  const sourceTypeLabels: Record<UsageSourceType, string> = {
    tts: t('summary.byType.tts'),
    voice_cloning: t('summary.byType.voice_cloning'),
    live_call: t('summary.byType.live_call'),
    audio_processing: t('summary.byType.audio_processing'),
    api_tts: 'API TTS',
    api_voice_cloning: 'API Voice Cloning',
  };

  return (
    <div className="container mx-auto pb-10">
      <h2 className="mb-6 font-bold text-2xl">{t('header')}</h2>

      {/* Summary Cards */}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        {/* Monthly Summary */}
        <SummaryCard
          bySourceType={monthlySummary.bySourceType}
          noDataLabel={t('summary.noData')}
          sourceTypeLabels={sourceTypeLabels}
          subtitle={currentMonth}
          title={t('summary.title')}
          totalCredits={monthlySummary.totalCredits}
          totalCreditsLabel={t('summary.totalCredits')}
          totalOperations={monthlySummary.totalOperations}
          totalOperationsLabel={t('summary.operations')}
        />

        {/* All-time Summary */}
        <SummaryCard
          bySourceType={allTimeSummary.bySourceType}
          noDataLabel={t('summary.noData')}
          sourceTypeLabels={sourceTypeLabels}
          subtitle={t('summary.allTime')}
          title={t('summary.totalTitle')}
          totalCredits={allTimeSummary.totalCredits}
          totalCreditsLabel={t('summary.totalCredits')}
          totalOperations={allTimeSummary.totalOperations}
          totalOperationsLabel={t('summary.operations')}
        />
      </div>

      {/* Data Table */}
      <Suspense>
        <DataTable />
      </Suspense>
    </div>
  );
}
