'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';

import type { DailyCallCount } from '@/app/api/daily-stats/calls';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

// Matches the report's Calls baseline: the 14 days before yesterday.
const BASELINE_DAYS = 14;

const chartConfig = {
  calls: { color: 'var(--chart-1)', label: 'Calls' },
} satisfies ChartConfig;

type State = { days: DailyCallCount[] } | { error: string } | null;

async function fetchDays(initData: string): Promise<State> {
  const response = await fetch('/api/daily-stats/calls-chart', {
    headers: { Authorization: `tma ${initData}` },
  });
  if (!response.ok) return { error: `Request failed (${response.status})` };
  return response.json();
}

// Opened from the daily report's button. Telegram passes the signed init data
// in the URL fragment, so the page needs no Telegram script.
export default function TelegramCallsPage() {
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    const initData = new URLSearchParams(window.location.hash.slice(1)).get(
      'tgWebAppData',
    );
    if (!initData) {
      setState({ error: 'Open this page from the Telegram daily report.' });
      return;
    }
    fetchDays(initData).then(setState, () =>
      setState({ error: 'Network error' }),
    );
  }, []);

  if (!state) return <p className="p-4 text-muted-foreground">Loading…</p>;
  if ('error' in state) return <p className="p-4">{state.error}</p>;

  const { days } = state;
  const yesterday = days.at(-1);
  const baseline = days.slice(-1 - BASELINE_DAYS, -1);
  const average =
    baseline.reduce((sum, day) => sum + day.calls, 0) / baseline.length;

  return (
    <main className="p-4">
      <h1 className="font-semibold text-lg">Calls per day</h1>
      <p className="text-muted-foreground text-sm">
        Yesterday {yesterday?.calls ?? 0} · {BASELINE_DAYS}d avg{' '}
        {average.toFixed(1)} · UTC, excluding internal users
      </p>
      <ChartContainer className="mt-4 aspect-auto h-64" config={chartConfig}>
        <BarChart data={days} margin={{ left: -24, right: 4 }}>
          <XAxis
            axisLine={false}
            dataKey="date"
            minTickGap={24}
            tickFormatter={(date: string) => date.slice(5)}
            tickLine={false}
          />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
          <ReferenceLine
            stroke="var(--color-muted-foreground)"
            strokeDasharray="4 4"
            y={average}
          />
          <Bar dataKey="calls" fill="var(--color-calls)" radius={3}>
            {days.map((day) => (
              <Cell fillOpacity={day === yesterday ? 1 : 0.45} key={day.date} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </main>
  );
}
