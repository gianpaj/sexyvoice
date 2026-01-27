import { getDictionary } from '@/lib/i18n/get-dictionary';
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

  const dict = await getDictionary(lang, 'usage');

  // Get month name for display
  const currentMonth = new Date().toLocaleDateString(lang, {
    month: 'long',
    year: 'numeric',
  });

  // Source type labels for display
  const sourceTypeLabels: Record<UsageSourceType, string> = {
    tts: dict.summary.byType.tts,
    voice_cloning: dict.summary.byType.voice_cloning,
    live_call: dict.summary.byType.live_call,
    audio_processing: dict.summary.byType.audio_processing,
  };

  return (
    <div className="container mx-auto pb-10">
      <h2 className="mb-6 font-bold text-2xl">{dict.header}</h2>

      {/* Summary Cards */}
      <div className="mb-8 grid gap-4 md:grid-cols-2">
        {/* Monthly Summary */}
        <SummaryCard
          bySourceType={monthlySummary.bySourceType}
          noDataLabel={dict.summary.noData}
          sourceTypeLabels={sourceTypeLabels}
          subtitle={currentMonth}
          title={dict.summary.title}
          totalCredits={monthlySummary.totalCredits}
          totalCreditsLabel={dict.summary.totalCredits}
          totalOperations={monthlySummary.totalOperations}
          totalOperationsLabel={dict.summary.operations}
        />

        {/* All-time Summary */}
        <SummaryCard
          bySourceType={allTimeSummary.bySourceType}
          noDataLabel={dict.summary.noData}
          sourceTypeLabels={sourceTypeLabels}
          subtitle={dict.summary.allTime}
          title={dict.summary.totalTitle}
          totalCredits={allTimeSummary.totalCredits}
          totalCreditsLabel={dict.summary.totalCredits}
          totalOperations={allTimeSummary.totalOperations}
          totalOperationsLabel={dict.summary.operations}
        />
      </div>

      {/* Data Table */}
      <DataTable dict={dict} />
    </div>
  );
}
