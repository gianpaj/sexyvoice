import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

type BillingGroupBy = 'source_type' | 'api_key_id' | 'model';
type BucketWidth = '1d' | '7d';
type ApiUsageSourceType = Database['public']['Enums']['usage_source_type'];

interface ApiUsageDailyRow {
  api_key_id: string | null;
  model: string | null;
  requests: number;
  source_type: string;
  total_credits_used: number;
  total_dollar_amount: number;
  total_duration_seconds: number;
  total_input_chars: number;
  total_output_chars: number;
  usage_date: string;
  user_id: string;
}

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function parseEpochSeconds(value: string | null, fallback: Date): Date {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return new Date(parsed * 1000);
}

function floorToUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function bucketStart(date: Date, start: Date, widthDays: number): Date {
  const msPerDay = 24 * 60 * 60 * 1000;
  const deltaDays = Math.floor((date.getTime() - start.getTime()) / msPerDay);
  const bucketOffset = Math.floor(deltaDays / widthDays) * widthDays;
  return addDays(start, bucketOffset);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Endpoint supports multiple filter/group/bucket query modes.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const today = floorToUtcDay(new Date());
  const defaultStart = addDays(today, -30);
  const defaultEnd = addDays(today, 1);

  const startFromDate = parseDate(params.get('starting_on'), defaultStart);
  const endBeforeDate = parseDate(params.get('ending_before'), defaultEnd);
  const startFromEpoch = parseEpochSeconds(
    params.get('start_time'),
    startFromDate,
  );
  const endBeforeEpoch = parseEpochSeconds(
    params.get('end_time'),
    endBeforeDate,
  );

  const start = floorToUtcDay(startFromEpoch);
  const end = floorToUtcDay(endBeforeEpoch);

  if (end <= start) {
    return NextResponse.json(
      { error: 'ending_before must be after starting_on' },
      { status: 400 },
    );
  }

  const bucketWidth = (params.get('bucket_width') ?? '1d') as BucketWidth;
  if (!(bucketWidth === '1d' || bucketWidth === '7d')) {
    return NextResponse.json(
      { error: 'bucket_width must be 1d or 7d' },
      { status: 400 },
    );
  }

  const groupBy = params.get('group_by') as BillingGroupBy | null;
  if (groupBy && !['source_type', 'api_key_id', 'model'].includes(groupBy)) {
    return NextResponse.json(
      { error: 'group_by must be source_type, api_key_id, or model' },
      { status: 400 },
    );
  }

  const sourceTypeParam = params.get('source_type');
  const apiKeyId = params.get('api_key_id');
  let sourceType: ApiUsageSourceType | undefined;
  if (sourceTypeParam) {
    const validSourceTypes: ApiUsageSourceType[] = [
      'api_tts',
      'api_voice_cloning',
    ];
    if (!validSourceTypes.includes(sourceTypeParam as ApiUsageSourceType)) {
      return NextResponse.json(
        { error: 'Invalid source_type for API billing usage' },
        { status: 400 },
      );
    }
    sourceType = sourceTypeParam as ApiUsageSourceType;
  }

  let query = supabase
    .from('api_usage_daily')
    .select('*')
    .eq('user_id', user.id)
    .gte('usage_date', start.toISOString())
    .lt('usage_date', end.toISOString());

  if (sourceType) {
    query = query.eq('source_type', sourceType);
  }

  if (apiKeyId) {
    query = query.eq('api_key_id', apiKeyId);
  }

  const { data, error } = await query.order('usage_date', { ascending: true });

  if (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to fetch billing usage' },
      { status: 500 },
    );
  }

  const rows = (data ?? []) as ApiUsageDailyRow[];
  const widthDays = bucketWidth === '7d' ? 7 : 1;
  const bucketMap = new Map<
    string,
    {
      start: Date;
      end: Date;
      groups: Map<
        string,
        {
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
      >;
    }
  >();

  for (const row of rows) {
    const usageDate = new Date(row.usage_date);
    const currentBucketStart = bucketStart(usageDate, start, widthDays);
    const currentBucketEnd = addDays(currentBucketStart, widthDays);
    const bucketKey = currentBucketStart.toISOString();

    if (!bucketMap.has(bucketKey)) {
      bucketMap.set(bucketKey, {
        start: currentBucketStart,
        end: currentBucketEnd,
        groups: new Map(),
      });
    }

    const groupingValue = groupBy ? row[groupBy] : 'all';
    const groupKey = `${groupBy ?? 'all'}:${groupingValue ?? 'null'}`;
    const bucket = bucketMap.get(bucketKey);
    if (!bucket) {
      continue;
    }

    if (!bucket.groups.has(groupKey)) {
      bucket.groups.set(groupKey, {
        source_type: groupBy === 'source_type' ? row.source_type : null,
        api_key_id: groupBy === 'api_key_id' ? row.api_key_id : null,
        model: groupBy === 'model' ? row.model : null,
        requests: 0,
        total_input_chars: 0,
        total_output_chars: 0,
        total_duration_seconds: 0,
        total_dollar_amount: 0,
        total_credits_used: 0,
      });
    }

    const group = bucket.groups.get(groupKey);
    if (!group) {
      continue;
    }

    group.requests += row.requests;
    group.total_input_chars += row.total_input_chars;
    group.total_output_chars += row.total_output_chars;
    group.total_duration_seconds += row.total_duration_seconds;
    group.total_dollar_amount += row.total_dollar_amount;
    group.total_credits_used += row.total_credits_used;
  }

  const buckets = Array.from(bucketMap.values()).map((bucket) => ({
    object: 'bucket' as const,
    start_time: Math.floor(bucket.start.getTime() / 1000),
    end_time: Math.floor(bucket.end.getTime() / 1000),
    start_time_iso: bucket.start.toISOString(),
    end_time_iso: bucket.end.toISOString(),
    results: Array.from(bucket.groups.values()),
  }));

  return NextResponse.json({
    object: 'list',
    bucket_width: bucketWidth,
    start_time: Math.floor(start.getTime() / 1000),
    end_time: Math.floor(end.getTime() / 1000),
    start_time_iso: start.toISOString(),
    end_time_iso: end.toISOString(),
    group_by: groupBy,
    source_type: sourceType ?? null,
    api_key_id: apiKeyId,
    data: buckets,
  });
}
