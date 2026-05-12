'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from 'recharts';

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

type RechartsComponent = ComponentType<
  Record<string, unknown> & { children?: ReactNode }
>;

const BillingBar = Bar as unknown as RechartsComponent;
const BillingCartesianGrid = CartesianGrid as unknown as RechartsComponent;
const BillingComposedChart = ComposedChart as unknown as RechartsComponent;
const BillingLine = Line as unknown as RechartsComponent;
const BillingXAxis = XAxis as unknown as RechartsComponent;
const BillingYAxis = YAxis as unknown as RechartsComponent;

interface BillingUsageResult {
  api_key_id: string | null;
  model: string | null;
  requests: number;
  source_type: string | null;
  total_credits_used: number;
  total_dollar_amount: number;
  total_duration_seconds: number;
  total_input_chars: number;
  total_output_chars: number;
}

interface BillingUsageBucket {
  end_time_iso: string;
  results: BillingUsageResult[];
  start_time_iso: string;
}

interface BillingUsageResponse {
  data: BillingUsageBucket[];
}

const chartConfig = {
  requests: {
    label: 'Requests',
    color: 'hsl(var(--chart-1))',
  },
  credits: {
    label: 'Credits',
    color: 'hsl(var(--chart-2))',
  },
  cost: {
    label: 'Cost (USD)',
    color: 'hsl(var(--chart-3))',
  },
} satisfies ChartConfig;

async function fetchBillingUsage(query: string): Promise<BillingUsageResponse> {
  const response = await fetch(`/api/billing/usage?${query}`);
  if (!response.ok) {
    throw new Error('Failed to fetch billing usage');
  }
  return response.json();
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDaysToIsoDate(value: string, days: number): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return isoDate(parsed);
}

/** Build a complete list of bucket start-dates covering [startingOn, endingBefore). */
function buildDateSpine(
  startingOn: string,
  endingBefore: string,
  bucketWidth: string,
): string[] {
  const stepDays = bucketWidth === '7d' ? 7 : 1;
  const spine: string[] = [];
  let current = startingOn;
  while (current < endingBefore) {
    spine.push(current);
    current = addDaysToIsoDate(current, stepDays);
  }
  return spine;
}

export function BillingUsageChart() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [defaultDateRange, setDefaultDateRange] = useState<{
    endingBefore: string;
    startingOn: string;
  } | null>(null);

  useEffect(() => {
    setDefaultDateRange({
      endingBefore: isoDate(new Date()),
      startingOn: isoDate(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)),
    });
  }, []);

  const endingBefore =
    searchParams.get('ending_before') ?? defaultDateRange?.endingBefore ?? '';
  const startingOn =
    searchParams.get('starting_on') ?? defaultDateRange?.startingOn ?? '';
  const groupBy = searchParams.get('group_by') ?? 'source_type';
  const bucketWidth = searchParams.get('bucket_width') ?? '1d';
  const sourceType = searchParams.get('source_type') ?? 'all';

  const queryParams = new URLSearchParams();
  queryParams.set('starting_on', startingOn);
  queryParams.set('ending_before', addDaysToIsoDate(endingBefore, 1));
  queryParams.set('group_by', groupBy);
  queryParams.set('bucket_width', bucketWidth);
  if (sourceType !== 'all') {
    queryParams.set('source_type', sourceType);
  }
  const queryString = queryParams.toString();

  const { data, isLoading, error } = useQuery({
    queryKey: ['billing-usage', queryString],
    queryFn: () => fetchBillingUsage(queryString),
    enabled: !!(endingBefore && startingOn),
  });

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === 'all') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  // Build a lookup from date → aggregated totals from the API response.
  const byDate = new Map<
    string,
    { requests: number; cost: number; credits: number }
  >();
  for (const bucket of data?.data ?? []) {
    const date = bucket.start_time_iso.slice(0, 10);
    const totals = bucket.results.reduce(
      (accumulator, result) => {
        accumulator.requests += result.requests;
        accumulator.cost += result.total_dollar_amount;
        accumulator.credits += result.total_credits_used;
        return accumulator;
      },
      { requests: 0, cost: 0, credits: 0 },
    );
    byDate.set(date, totals);
  }

  // Generate the full spine so empty days still appear in the chart.
  const spine = buildDateSpine(
    startingOn,
    addDaysToIsoDate(endingBefore, 1),
    bucketWidth,
  );
  const bucketTotals = spine.map((date) => ({
    date,
    ...(byDate.get(date) ?? { requests: 0, cost: 0, credits: 0 }),
  }));

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">From</span>
          <Input
            onChange={(event) => updateParam('starting_on', event.target.value)}
            type="date"
            value={startingOn}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">To</span>
          <Input
            onChange={(event) =>
              updateParam('ending_before', event.target.value)
            }
            type="date"
            value={endingBefore}
          />
        </div>
        <Select
          onValueChange={(value) => updateParam('group_by', value)}
          value={groupBy}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="source_type">Group: Source Type</SelectItem>
            <SelectItem value="api_key_id">Group: API Key</SelectItem>
            <SelectItem value="model">Group: Model</SelectItem>
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) => updateParam('bucket_width', value)}
          value={bucketWidth}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1d">Daily</SelectItem>
            <SelectItem value="7d">Weekly</SelectItem>
          </SelectContent>
        </Select>
        <Select
          onValueChange={(value) => updateParam('source_type', value)}
          value={sourceType}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All API sources</SelectItem>
            <SelectItem value="api_tts">API TTS</SelectItem>
            <SelectItem value="api_voice_cloning">API Voice Cloning</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : null}

      {error ? (
        <p className="text-destructive text-sm">Failed to load usage chart.</p>
      ) : null}

      {!(isLoading || error) && bucketTotals.every((b) => b.requests === 0) ? (
        <p className="text-muted-foreground text-sm">
          No usage in selected period.
        </p>
      ) : null}

      {isLoading || error ? null : (
        <ChartContainer className="h-[320px] w-full" config={chartConfig}>
          <BillingComposedChart accessibilityLayer data={bucketTotals}>
            <BillingCartesianGrid vertical={false} />
            <BillingXAxis
              axisLine={false}
              dataKey="date"
              minTickGap={20}
              tickLine={false}
              tickMargin={8}
            />
            <BillingYAxis
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              yAxisId="left"
            />
            <BillingYAxis
              axisLine={false}
              orientation="right"
              tickLine={false}
              tickMargin={8}
              yAxisId="right"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <BillingBar
              dataKey="requests"
              fill="var(--color-requests)"
              name="Requests"
              radius={4}
              yAxisId="left"
            />
            <BillingLine
              dataKey="cost"
              dot={false}
              name="Cost (USD)"
              stroke="var(--color-cost)"
              strokeWidth={2}
              yAxisId="right"
            />
            <BillingLine
              dataKey="credits"
              dot={false}
              name="Credits"
              stroke="var(--color-credits)"
              strokeWidth={2}
              yAxisId="right"
            />
          </BillingComposedChart>
        </ChartContainer>
      )}
    </div>
  );
}
