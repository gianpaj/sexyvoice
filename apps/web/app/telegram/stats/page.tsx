'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';

import {
  baselineAverage,
  type ChartsResponse,
  type DailyChartRow,
} from '@/app/api/daily-stats/charts';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

type Metric = Exclude<keyof DailyChartRow, 'date'>;

interface ChartSpec {
  /** Whether the report's average for this metric includes yesterday. */
  baselineIncludesYesterday: boolean;
  format: (value: number) => string;
  /** Stacked bottom to top. */
  series: { color: string; key: Metric; label: string }[];
  title: string;
}

const formatNumber = (value: number) =>
  value.toLocaleString('en', { maximumFractionDigits: 1 });

const formatUsd = (value: number) =>
  `$${value.toLocaleString('en', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;

const CHARTS: ChartSpec[] = [
  {
    baselineIncludesYesterday: true,
    format: formatUsd,
    series: [{ color: 'var(--chart-2)', key: 'revenueUsd', label: 'Revenue' }],
    title: 'Revenue',
  },
  {
    baselineIncludesYesterday: false,
    format: formatNumber,
    series: [{ color: 'var(--chart-1)', key: 'calls', label: 'Calls' }],
    title: 'Calls',
  },
  {
    baselineIncludesYesterday: false,
    format: (value) => `${formatNumber(value)} min`,
    series: [{ color: 'var(--chart-1)', key: 'callMinutes', label: 'Minutes' }],
    title: 'Call minutes',
  },
  {
    baselineIncludesYesterday: true,
    format: formatNumber,
    series: [
      { color: 'var(--chart-3)', key: 'audio', label: 'TTS' },
      { color: 'var(--chart-4)', key: 'clonedAudio', label: 'Cloned voice' },
    ],
    title: 'Audio files',
  },
  {
    baselineIncludesYesterday: true,
    format: formatNumber,
    series: [{ color: 'var(--chart-5)', key: 'profiles', label: 'Profiles' }],
    title: 'New profiles',
  },
];

type State = ChartsResponse | { error: string } | null;

async function fetchCharts(initData: string): Promise<State> {
  const response = await fetch('/api/daily-stats/charts', {
    headers: { Authorization: `tma ${initData}` },
  });
  if (!response.ok) return { error: `Request failed (${response.status})` };
  return response.json();
}

function DailyChart({
  baselineDays,
  days,
  spec,
}: {
  baselineDays: number;
  days: DailyChartRow[];
  spec: ChartSpec;
}) {
  const total = (day: DailyChartRow) =>
    spec.series.reduce((sum, { key }) => sum + day[key], 0);
  const yesterday = days.at(-1);
  const average = baselineAverage(
    days.map(total),
    baselineDays,
    spec.baselineIncludesYesterday,
  );
  const config: ChartConfig = Object.fromEntries(
    spec.series.map(({ color, key, label }) => [key, { color, label }]),
  );

  return (
    <section className="mt-6">
      <h2 className="font-semibold">{spec.title}</h2>
      <p className="text-muted-foreground text-sm">
        Yesterday {spec.format(yesterday ? total(yesterday) : 0)} ·{' '}
        {baselineDays}d avg {spec.format(average)}
      </p>
      <ChartContainer className="mt-2 aspect-auto h-44" config={config}>
        <BarChart data={days} margin={{ left: -16, right: 4 }}>
          <XAxis
            axisLine={false}
            dataKey="date"
            minTickGap={24}
            tickFormatter={(date: string) => date.slice(5)}
            tickLine={false}
          />
          <YAxis axisLine={false} tickLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} cursor={false} />
          {spec.series.length > 1 && (
            <ChartLegend content={<ChartLegendContent />} />
          )}
          <ReferenceLine
            stroke="var(--color-muted-foreground)"
            strokeDasharray="4 4"
            y={average}
          />
          {spec.series.map(({ key }, index) => (
            <Bar
              dataKey={key}
              fill={`var(--color-${key})`}
              key={key}
              radius={index === spec.series.length - 1 ? [3, 3, 0, 0] : 0}
              stackId="day"
            >
              {days.map((day) => (
                <Cell
                  fillOpacity={day === yesterday ? 1 : 0.45}
                  key={day.date}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
    </section>
  );
}

// Opened from the daily report's charts message. Telegram passes the signed
// init data in the URL fragment, so the page needs no Telegram script.
export default function TelegramStatsPage() {
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    const initData = new URLSearchParams(window.location.hash.slice(1)).get(
      'tgWebAppData',
    );
    if (!initData) {
      setState({ error: 'Open this page from the Telegram daily report.' });
      return;
    }
    fetchCharts(initData).then(setState, () =>
      setState({ error: 'Network error' }),
    );
  }, []);

  if (!state) return <p className="p-4 text-muted-foreground">Loading…</p>;
  if ('error' in state) return <p className="p-4">{state.error}</p>;

  return (
    <main className="p-4">
      <h1 className="font-semibold text-lg">SexyVoice stats</h1>
      <p className="text-muted-foreground text-sm">
        Last {state.days.length} UTC days, excluding internal users. Dashed
        line: the report's {state.baselineDays}-day average.
      </p>
      {CHARTS.map((spec) => (
        <DailyChart
          baselineDays={state.baselineDays}
          days={state.days}
          key={spec.title}
          spec={spec}
        />
      ))}
    </main>
  );
}
