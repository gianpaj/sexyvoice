'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Line, XAxis, YAxis } from 'recharts';

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

interface BillingUsageResult {
  source_type: string | null;
  api_key_id: string | null;
  model: string | null;
  requests: number;
  total_input_chars: number;
  total_output_chars: number;
  total_duration_seconds: number;
  total_dollar_amount: number;
  total_credits_used: number;
}

interface BillingUsageBucket {
  start_time_iso: string;
  end_time_iso: string;
  results: BillingUsageResult[];
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

export function BillingUsageChart() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const endingBefore = searchParams.get('ending_before') ?? isoDate(new Date());
  const startingOn =
    searchParams.get('starting_on') ??
    isoDate(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
  const groupBy = searchParams.get('group_by') ?? 'source_type';
  const bucketWidth = searchParams.get('bucket_width') ?? '1d';
  const sourceType = searchParams.get('source_type') ?? 'all';

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set('starting_on', startingOn);
    params.set('ending_before', endingBefore);
    params.set('group_by', groupBy);
    params.set('bucket_width', bucketWidth);
    if (sourceType !== 'all') {
      params.set('source_type', sourceType);
    }
    return params.toString();
  }, [bucketWidth, endingBefore, groupBy, sourceType, startingOn]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['billing-usage', queryString],
    queryFn: () => fetchBillingUsage(queryString),
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

  const bucketTotals = (data?.data ?? []).map((bucket) => {
    const totalRequests = bucket.results.reduce(
      (sum, result) => sum + result.requests,
      0,
    );
    const totalCost = bucket.results.reduce(
      (sum, result) => sum + result.total_dollar_amount,
      0,
    );
    const totalCredits = bucket.results.reduce(
      (sum, result) => sum + result.total_credits_used,
      0,
    );
    return {
      date: bucket.start_time_iso.slice(0, 10),
      requests: totalRequests,
      cost: totalCost,
      credits: totalCredits,
    };
  });

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

      {!(isLoading || error) && bucketTotals.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No usage in selected period.
        </p>
      ) : null}

      {!(isLoading || error) && bucketTotals.length > 0 ? (
        <ChartContainer className="h-[320px] w-full" config={chartConfig}>
          <BarChart accessibilityLayer data={bucketTotals}>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="date"
              minTickGap={20}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              yAxisId="left"
            />
            <YAxis
              axisLine={false}
              orientation="right"
              tickLine={false}
              tickMargin={8}
              yAxisId="right"
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="requests"
              fill="var(--color-requests)"
              name="Requests"
              radius={4}
              yAxisId="left"
            />
            <Line
              dataKey="cost"
              dot={false}
              name="Cost (USD)"
              stroke="var(--color-cost)"
              strokeWidth={2}
              yAxisId="right"
            />
            <Line
              dataKey="credits"
              dot={false}
              name="Credits"
              stroke="var(--color-credits)"
              strokeWidth={2}
              yAxisId="right"
            />
          </BarChart>
        </ChartContainer>
      ) : null}
    </div>
  );
}
