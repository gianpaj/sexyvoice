// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SummaryCard } from '@/app/[lang]/(dashboard)/dashboard/usage/summary-card';
import type {
  MonthlyUsageSummary,
  UsageSourceType,
} from '@/lib/supabase/usage-queries';

const sourceTypeLabels: Record<UsageSourceType, string> = {
  api_tts: 'API TTS',
  api_voice_cloning: 'API Voice Cloning',
  audio_processing: 'Audio Processing',
  live_call: 'Live Call',
  tts: 'TTS',
  voice_cloning: 'Voice Cloning',
};

describe('SummaryCard', () => {
  it('sorts active source types by credits, count, and source type', () => {
    const bySourceType = Object.fromEntries([
      ['voice_cloning', { count: 3, credits: 100 }],
      ['tts', { count: 1, credits: 100 }],
      ['live_call', { count: 3, credits: 100 }],
      ['audio_processing', { count: 1, credits: 200 }],
      ['api_voice_cloning', { count: 0, credits: 999 }],
      ['api_tts', { count: 0, credits: 999 }],
    ]) as MonthlyUsageSummary['bySourceType'];

    render(
      <SummaryCard
        bySourceType={bySourceType}
        noDataLabel="No usage"
        sourceTypeLabels={sourceTypeLabels}
        subtitle="This month"
        title="Usage"
        totalCredits={500}
        totalCreditsLabel="Credits"
        totalOperations={8}
        totalOperationsLabel="Operations"
      />,
    );

    expect(
      screen
        .getAllByText(/^(Audio Processing|Live Call|TTS|Voice Cloning)$/)
        .map((element) => element.textContent),
    ).toEqual(['Audio Processing', 'Live Call', 'Voice Cloning', 'TTS']);
    expect(screen.queryByText('API TTS')).not.toBeInTheDocument();
    expect(screen.queryByText('API Voice Cloning')).not.toBeInTheDocument();
  });
});
