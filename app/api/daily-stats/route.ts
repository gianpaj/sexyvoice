/** biome-ignore-all lint/performance/noNamespaceImport: it's fine */
import * as fs from 'node:fs';
import { join } from 'node:path';
import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Debug cache file path (temporary for debugging)
const CACHE_FILE = join(process.cwd(), '.daily-stats-cache.json');

import {
  countActiveCustomerSubscriptions,
  findNextSubscriptionDueForPayment,
} from '@/lib/redis/queries';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserByStripeCustomerId } from '@/lib/supabase/queries';
import type { UsageSourceType } from '@/lib/supabase/usage-queries';
import {
  filterByDateRange,
  formatChange,
  formatCompactNumber,
  formatCurrencyChange,
  maskUsername,
  reduceAmountUsd,
  startOfDay,
  startOfMonth,
  startOfPreviousMonth,
  subtractDays,
} from './utils';

// Allow up to 5 minutes — the cron does many paginated DB fetches and without
// this Vercel kills the function depending on the plan,
// which drops the PostgREST connection and surfaces as a PostgreSQL 57014
// (query_canceled) error rather than a Vercel timeout.
export const maxDuration = 300;

const VOICE_CLONING_MODELS = [
  'resemble-ai/chatterbox-multilingual',
  'resemble-ai/chatterbox',
  'voxtral-mini-tts-2603',
];

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: it's fine
export async function GET(request: NextRequest) {
  const isProd = process.env.NODE_ENV === 'production';

  const authHeader = request.headers.get('authorization');
  if (isProd && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', {
      status: 401,
    });
  }

  const webhook = process.env.TELEGRAM_WEBHOOK_URL;
  if (!webhook) {
    return NextResponse.json(
      { error: 'Missing TELEGRAM_WEBHOOK_URL' },
      { status: 500 },
    );
  }

  let checkInId = '';
  if (isProd) {
    checkInId = Sentry.captureCheckIn({
      monitorSlug: 'telegram-bot-daily-stats',
      status: 'in_progress',
    });
  }

  let dateParam: string | null = null;
  if (!isProd) {
    const { searchParams } = request.nextUrl;
    dateParam = searchParams.get('date');
  }

  const supabase = createAdminClient();
  const untilNow = dateParam ? new Date(dateParam) : new Date();
  const today = startOfDay(untilNow);
  const cacheReportDate = today.toISOString().slice(0, 10);
  const useCache = !isProd && fs.existsSync(CACHE_FILE);
  const previousDay = subtractDays(today, 1);
  const twoDaysAgo = subtractDays(today, 2);
  const sevenDaysAgo = subtractDays(today, 7);
  const thirtyDaysAgo = subtractDays(today, 30);
  // Use previousDay for MTD calculations since we're reporting on that day's month
  const monthStart = startOfMonth(previousDay);
  const previousMonthStart = startOfPreviousMonth(previousDay);
  const twoMonthsAgoStart = new Date(
    Date.UTC(previousDay.getUTCFullYear(), previousDay.getUTCMonth() - 2, 1),
  );
  const threeMonthsAgoStart = new Date(
    Date.UTC(previousDay.getUTCFullYear(), previousDay.getUTCMonth() - 3, 1),
  );

  // Calculate previous month period ends for comparison
  // Cap at each month's start to avoid bleeding into the next month when a prior month has fewer days
  const duration = today.getTime() - monthStart.getTime();
  const previousMonthPeriodEnd = new Date(
    Math.min(previousMonthStart.getTime() + duration, monthStart.getTime()),
  );
  const twoMonthsAgoPeriodEnd = new Date(
    Math.min(
      twoMonthsAgoStart.getTime() + duration,
      previousMonthStart.getTime(),
    ),
  );
  const threeMonthsAgoPeriodEnd = new Date(
    Math.min(
      threeMonthsAgoStart.getTime() + duration,
      twoMonthsAgoStart.getTime(),
    ),
  );

  // Partial credit_transactions type matching the selected columns
  interface CreditTransaction {
    created_at: string;
    description: string | null;
    id: string;
    metadata: Json;
    profiles: { username: string } | null;
    type: 'purchase' | 'freemium' | 'topup' | 'refund';
    user_id: string;
  }

  interface UsageEvent {
    credits_used: number;
    id: string;
    occurred_at: string;
    profiles: { username: string } | null;
    source_type: string;
    user_id: string;
  }

  // Load from cache if available (non-prod only)
  // biome-ignore lint/suspicious/noExplicitAny: Cache data is dynamically typed
  let audioYesterdayResult: any;
  // biome-ignore lint/suspicious/noExplicitAny: Cache data is dynamically typed
  let audioWeekResult: any;
  // biome-ignore lint/suspicious/noExplicitAny: Cache data is dynamically typed
  let audioTotalCountResult: any;
  // biome-ignore lint/suspicious/noExplicitAny: Cache data is dynamically typed
  let clonesResult: any;
  // biome-ignore lint/suspicious/noExplicitAny: Cache data is dynamically typed
  let profilesRecentResult: any;
  // biome-ignore lint/suspicious/noExplicitAny: Cache data is dynamically typed
  let profilesTotalCountResult: any;
  // biome-ignore lint/suspicious/noExplicitAny: Cache data is dynamically typed
  let apiKeysYesterdayResult: any;
  let allCreditTransactions: CreditTransaction[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: Cache data is dynamically typed
  let activeSubscribersCount: any;
  // biome-ignore lint/suspicious/noExplicitAny: Cache data is dynamically typed
  let nextSubscriptionDueForPayment: any;
  // biome-ignore lint/suspicious/noExplicitAny: Cache data is dynamically typed
  let callSessionsWeekResult: any;
  // biome-ignore lint/suspicious/noExplicitAny: Cache data is dynamically typed
  let callSessionsTotalCountResult: any;
  // biome-ignore lint/suspicious/noExplicitAny: Cache data is dynamically typed
  let callSessionsAllTimeDurationResult: any;
  let usageEventsWeekResult:
    | { data: UsageEvent[] | null; error: unknown }
    | undefined;
  let loadedFromValidCache = false;

  if (useCache) {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    if (typeof cached.reportDate !== 'string') {
      console.log(
        '♻️ Ignoring legacy cache without reportDate:',
        CACHE_FILE,
        '(forcing refresh)',
      );
    } else if (cached.reportDate === cacheReportDate) {
      console.log(
        '📦 Loading from cache:',
        CACHE_FILE,
        `(report date: ${cached.reportDate})`,
      );
      audioYesterdayResult = cached.audioYesterdayResult;
      audioWeekResult = cached.audioWeekResult;
      audioTotalCountResult = cached.audioTotalCountResult;
      clonesResult = cached.clonesResult;
      profilesRecentResult = cached.profilesRecentResult;
      profilesTotalCountResult = cached.profilesTotalCountResult;
      apiKeysYesterdayResult = cached.apiKeysYesterdayResult;
      allCreditTransactions = cached.allCreditTransactions;
      activeSubscribersCount = cached.activeSubscribersCount;
      nextSubscriptionDueForPayment = cached.nextSubscriptionDueForPayment;
      callSessionsWeekResult = cached.callSessionsWeekResult;
      callSessionsTotalCountResult = cached.callSessionsTotalCountResult;
      callSessionsAllTimeDurationResult =
        cached.callSessionsAllTimeDurationResult;
      usageEventsWeekResult = cached.usageEventsWeekResult;
      loadedFromValidCache = true;
    } else {
      console.log(
        '♻️ Ignoring stale cache:',
        CACHE_FILE,
        `(cached: ${cached.reportDate}, requested: ${cacheReportDate})`,
      );
    }
  }

  if (!loadedFromValidCache) {
    // Helper to time individual queries
    const _timed = async <T>(
      label: string,
      promise: PromiseLike<T>,
    ): Promise<T> => {
      const start = Date.now();
      console.log(`⏱  [daily-stats] START  ${label}`);
      try {
        const result = await promise;
        console.log(
          `✅ [daily-stats] DONE   ${label} — ${Date.now() - start}ms`,
        );
        return result;
      } catch (err) {
        console.log(
          `❌ [daily-stats] ERROR  ${label} — ${Date.now() - start}ms`,
          err,
        );
        throw err;
      }
    };

    // Fetch data in parallel - combine related queries and filter in memory
    [
      // Audio files - fetch for last specific ranges
      audioYesterdayResult,
      audioWeekResult,
      audioTotalCountResult,
      clonesResult,
      profilesRecentResult,
      profilesTotalCountResult,
      apiKeysYesterdayResult,

      activeSubscribersCount,
      nextSubscriptionDueForPayment,
      // Call sessions - fetch for last 7 days (includes yesterday)
      callSessionsWeekResult,
      callSessionsTotalCountResult,
      callSessionsAllTimeDurationResult,
    ] = await Promise.all([
      // (audioYesterdayResult) Audio files yesterday with voice information
      _timed(
        `audio_files:yesterday ${previousDay.toISOString().slice(0, 10)}..${today.toISOString().slice(0, 10)}`,
        supabase
          .from('audio_files')
          .select('id, created_at, model, voice_id, voices(name)')
          .gte('created_at', previousDay.toISOString())
          .lt('created_at', today.toISOString())
          .then((result) => result),
      ),

      // (audioWeekResult) Audio files last 7 days
      _timed(
        `audio_files:week_count ${sevenDaysAgo.toISOString().slice(0, 10)}..${today.toISOString().slice(0, 10)}`,
        supabase
          .from('audio_files')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgo.toISOString())
          .lt('created_at', today.toISOString())
          .then((result) => result),
      ),

      // (audioTotalCountResult) Approximate total audio files count
      _timed(
        `audio_files:total_count_estimated < ${today.toISOString().slice(0, 10)}`,
        supabase
          .from('audio_files')
          .select('id', { count: 'planned', head: true })
          .lt('created_at', today.toISOString())
          .then((result) => result),
      ),

      // (clonesResult) Cloned audio files last 7 days (includes yesterday)
      _timed(
        `audio_files:clones ${sevenDaysAgo.toISOString().slice(0, 10)}..${today.toISOString().slice(0, 10)}`,
        supabase
          .from('audio_files')
          .select('id, created_at')
          .in('model', VOICE_CLONING_MODELS)
          .gte('created_at', sevenDaysAgo.toISOString())
          .lt('created_at', today.toISOString())
          .then((result) => result),
      ),

      // (profilesRecentResult) Placeholder; fetched below with pagination because
      // Supabase caps result sets at 1000 rows per request
      Promise.resolve({ data: null, error: null }),

      // (profilesTotalCountResult) Total profiles count
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .lt('created_at', today.toISOString()),

      // (apiKeysYesterdayResult) API keys created yesterday with usage
      supabase
        .from('api_keys')
        .select('id, created_at, last_used_at')
        .gte('created_at', previousDay.toISOString())
        .lt('created_at', today.toISOString()),

      // Fetch active subscribers count
      countActiveCustomerSubscriptions(),
      findNextSubscriptionDueForPayment(),

      // (callSessionsWeekResult) Call sessions last 7 days with duration info
      supabase
        .from('call_sessions')
        .select('id, started_at, duration_seconds, credits_used, status')
        .gte('started_at', sevenDaysAgo.toISOString())
        .lt('started_at', today.toISOString()),

      // (callSessionsTotalCountResult) Total call sessions count
      supabase
        .from('call_sessions')
        .select('id', { count: 'exact', head: true })
        .lt('started_at', today.toISOString()),

      // (callSessionsAllTimeDurationResult) All-time call sessions durations
      supabase
        .from('call_sessions')
        .select('duration_seconds')
        .lt('started_at', today.toISOString()),
    ]);

    // Fetch all usage events with pagination (Supabase limits to 1000 per request)
    const fetchAllUsageEvents = async () => {
      const allEvents: {
        id: string;
        user_id: string;
        source_type: string;
        credits_used: number;
        occurred_at: string;
        profiles: { username: string } | null;
      }[] = [];
      const pageSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('usage_events')
          .select(
            'id, user_id, source_type, credits_used, occurred_at, profiles(username)',
          )
          .gte('occurred_at', sevenDaysAgo.toISOString())
          .lt('occurred_at', today.toISOString())
          .order('occurred_at', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allEvents.push(...data);
          offset += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      return allEvents;
    };

    usageEventsWeekResult = {
      data: await fetchAllUsageEvents(),
      error: null,
    };

    // Fetch all credit transactions with pagination (Supabase limits to 1000 per request)
    const fetchAllProfilesInRange = async (
      start: Date,
      end: Date,
    ): Promise<
      {
        id: string;
        created_at: string | null;
        username: string | null;
      }[]
    > => {
      const allProfiles: {
        id: string;
        created_at: string | null;
        username: string | null;
      }[] = [];
      const pageSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, created_at, username')
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString())
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allProfiles.push(...data);
          offset += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      return allProfiles;
    };

    profilesRecentResult = {
      data: await fetchAllProfilesInRange(sevenDaysAgo, today),
      error: null,
    };

    const fetchCreditTransactionsInRange = async (
      start: Date,
      end: Date,
    ): Promise<CreditTransaction[]> => {
      const allTransactions: CreditTransaction[] = [];
      const pageSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('credit_transactions')
          .select(
            'id, user_id, created_at, type, description, amount, metadata, profiles(username)',
          )
          .in('type', ['purchase', 'topup', 'refund'])
          .not('description', 'ilike', '%manual%')
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString())
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allTransactions.push(...data);
          offset += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      return allTransactions;
    };

    const [
      yesterdayCreditTransactions,
      sevenDayCreditTransactions,
      thirtyDayCreditTransactions,
      monthToDateCreditTransactions,
      previousMonthToDateCreditTransactions,
      twoMonthsAgoToDateCreditTransactions,
      threeMonthsAgoToDateCreditTransactions,
      allTimeRefundTransactions,
    ] = await Promise.all([
      fetchCreditTransactionsInRange(previousDay, today),
      fetchCreditTransactionsInRange(sevenDaysAgo, today),
      fetchCreditTransactionsInRange(thirtyDaysAgo, today),
      fetchCreditTransactionsInRange(monthStart, today),
      fetchCreditTransactionsInRange(
        previousMonthStart,
        previousMonthPeriodEnd,
      ),
      fetchCreditTransactionsInRange(twoMonthsAgoStart, twoMonthsAgoPeriodEnd),
      fetchCreditTransactionsInRange(
        threeMonthsAgoStart,
        threeMonthsAgoPeriodEnd,
      ),
      fetchCreditTransactionsInRange(
        new Date('1970-01-01T00:00:00.000Z'),
        today,
      ),
    ]);

    allCreditTransactions = [
      ...new Map(
        [
          ...allTimeRefundTransactions,
          ...yesterdayCreditTransactions,
          ...sevenDayCreditTransactions,
          ...thirtyDayCreditTransactions,
          ...monthToDateCreditTransactions,
          ...previousMonthToDateCreditTransactions,
          ...twoMonthsAgoToDateCreditTransactions,
          ...threeMonthsAgoToDateCreditTransactions,
        ].map((transaction) => [transaction.id, transaction]),
      ).values(),
    ].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  } // end of else (not using cache)

  if (audioYesterdayResult?.error) throw audioYesterdayResult.error;
  if (audioWeekResult?.error) throw audioWeekResult.error;
  if (audioTotalCountResult?.error) throw audioTotalCountResult.error;
  if (clonesResult?.error) throw clonesResult.error;
  if (profilesRecentResult?.error) throw profilesRecentResult.error;
  if (profilesTotalCountResult?.error) throw profilesTotalCountResult.error;
  if (apiKeysYesterdayResult?.error) throw apiKeysYesterdayResult.error;

  if (callSessionsWeekResult?.error) throw callSessionsWeekResult.error;
  if (callSessionsTotalCountResult?.error)
    throw callSessionsTotalCountResult.error;
  if (!usageEventsWeekResult) {
    throw new Error(
      'usageEventsWeekResult was not loaded after cache validation/fetch',
    );
  }
  if (usageEventsWeekResult.error) throw usageEventsWeekResult.error;

  // Cache results for faster debugging (non-prod only) — written after error
  // checks so we never persist a partial/failed response to disk
  if (!isProd) {
    const cacheData = {
      reportDate: cacheReportDate,
      audioYesterdayResult,
      audioWeekResult,
      audioTotalCountResult,
      clonesResult,
      profilesRecentResult,
      profilesTotalCountResult,
      apiKeysYesterdayResult,
      allCreditTransactions,
      activeSubscribersCount,
      nextSubscriptionDueForPayment,
      callSessionsWeekResult,
      callSessionsTotalCountResult,
      callSessionsAllTimeDurationResult,
      usageEventsWeekResult,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2));
    console.log(
      '📦 Cached API results to',
      CACHE_FILE,
      `(report date: ${cacheReportDate})`,
    );
  }

  const audioYesterdayData = audioYesterdayResult.data ?? [];
  const audioYesterdayCount = audioYesterdayData.length;
  const audioWeekCount = audioWeekResult.count ?? 0;
  const audioTotalCount = audioTotalCountResult.count ?? 0;

  const clonesData = (
    (clonesResult.data ?? []) as { id: string; created_at: string | null }[]
  ).filter(
    (item): item is { id: string; created_at: string } =>
      item.created_at !== null,
  );
  const profilesRecentData = (
    (profilesRecentResult.data ?? []) as {
      id: string;
      created_at: string | null;
      username: string;
    }[]
  ).filter(
    (item): item is { id: string; created_at: string; username: string } =>
      item.created_at !== null,
  );
  const profilesTotalCount = profilesTotalCountResult.count ?? 0;
  const apiKeysYesterdayData = (apiKeysYesterdayResult.data ?? []) as {
    id: string;
    created_at: string;
    last_used_at: string | null;
  }[];
  // Count keys created yesterday that have been used
  const usedNewApiKeysCount = apiKeysYesterdayData.filter(
    (key) => key.last_used_at !== null,
  ).length;

  const creditTransactions: CreditTransaction[] = allCreditTransactions;

  const callSessionsWeekData = (
    (callSessionsWeekResult.data ?? []) as (Tables<'call_sessions'> & {
      started_at: string | null;
    })[]
  ).filter((item): item is Tables<'call_sessions'> => item.started_at !== null);
  const callSessionsTotalCount = callSessionsTotalCountResult.count ?? 0;
  const callSessionsAllTimeDurationData =
    (callSessionsAllTimeDurationResult.data ?? []) as {
      duration_seconds: number;
    }[];
  const usageEventsWeekData: UsageEvent[] = usageEventsWeekResult.data ?? [];

  // Calculate API TTS credits used yesterday
  const apiTtsCreditsYesterday = filterByDateRange(
    usageEventsWeekData,
    previousDay,
    today,
    'occurred_at',
  )
    .filter((e) => e.source_type === 'api_tts')
    .reduce((sum, e) => sum + e.credits_used, 0);

  // Filter call sessions by date ranges (using started_at as the date field)
  const callSessionsYesterdayData = filterByDateRange<
    'started_at',
    Tables<'call_sessions'>
  >(callSessionsWeekData, previousDay, today, 'started_at');
  const callsYesterdayCount = callSessionsYesterdayData.length;
  const callsWeekCount = callSessionsWeekData.length;

  // Calculate total duration for yesterday and week
  const callsDurationYesterday = callSessionsYesterdayData.reduce(
    (sum: number, call: Tables<'call_sessions'>) => sum + call.duration_seconds,
    0,
  );
  const callsDurationWeek = callSessionsWeekData.reduce(
    (sum: number, call: Tables<'call_sessions'>) => sum + call.duration_seconds,
    0,
  );
  const callsAvgDurationYesterday =
    Math.round(callsDurationYesterday / callsYesterdayCount) || 0;
  const callsAvgDurationWeek =
    Math.round(callsDurationWeek / callsWeekCount) || 0;
  const callsDurationAllTime = callSessionsAllTimeDurationData.reduce(
    (sum, call) => sum + call.duration_seconds,
    0,
  );
  const callsAvgDurationAllTime =
    Math.round(
      callSessionsTotalCount > 0
        ? callsDurationAllTime / callSessionsTotalCount
        : 0,
    ) || 0;

  // Call costs at $0.05 per minute
  const CALL_COST_PER_MINUTE = 0.05;
  const callCostYesterday =
    (callsDurationYesterday / 60) * CALL_COST_PER_MINUTE;
  const callCostWeek = (callsDurationWeek / 60) * CALL_COST_PER_MINUTE;

  // Format duration in minutes
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const formatDurationChange = (
    currentSeconds: number,
    baselineSeconds: number,
  ): string => {
    const diffSeconds = Math.round(currentSeconds - baselineSeconds);
    const sign = diffSeconds >= 0 ? '+' : '-';
    return `${sign}${formatDuration(Math.abs(diffSeconds))}`;
  };

  // Separate refunds from purchases/top-ups
  const refundTransactions = creditTransactions.filter(
    (t) => t.type === 'refund',
  );
  const purchaseTransactions = creditTransactions.filter(
    (t) => t.type !== 'refund',
  );

  // Filter clones by date ranges
  const clonePrevCount = filterByDateRange(
    clonesData,
    previousDay,
    today,
  ).length;
  const cloneWeekCount = clonesData.length;

  // Filter profiles by date ranges
  const profilesYesterdayData = filterByDateRange(
    profilesRecentData,
    previousDay,
    today,
  );
  const profilesTodayCount = profilesYesterdayData.length;
  const profilesWeekCount = profilesRecentData.length;

  // Early exit if no audio files yesterday
  if (audioYesterdayCount === 0) {
    const message = `WARNING: No audio files generated yesterday! ${previousDay}-${today}`;
    console.warn({ message });
    if (!isProd) {
      return NextResponse.json({ ok: true });
    }
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: '202637584', text: message }),
    });

    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: 'telegram-bot-daily-stats',
      status: 'ok',
    });

    return NextResponse.json({ ok: true });
  }

  const nextPayingSubscriber =
    nextSubscriptionDueForPayment &&
    (await getUserByStripeCustomerId(
      nextSubscriptionDueForPayment?.customerId,
    ));

  // Top models calculation
  const normalizeModelName = (modelName: string | null | undefined) => {
    const trimmedModelName = modelName?.trim();
    if (!trimmedModelName) return 'Unknown';

    const modelWithoutVersion =
      trimmedModelName.split(':')[0] ?? trimmedModelName;
    const modelWithoutOwner =
      modelWithoutVersion.split('/').pop() ?? modelWithoutVersion;
    const normalizedModelName = modelWithoutOwner
      .replace('-preview-tts', '')
      .replace('-multilingual', '');

    const friendlyModelLabels: Record<string, string> = {
      chatterbox: 'Chatterbox',
      'gemini-2.5-flash': 'Gemini Flash',
      'gemini-2.5-pro': 'Gemini Pro',
      grok: 'Grok',
      'orpheus-3b-0.1-ft': 'Orpheus',
      'voxtral-mini-tts-2603': 'Voxtral Clone',
    };

    return friendlyModelLabels[normalizedModelName] ?? normalizedModelName;
  };

  const cloneModelLabels = new Set(['Chatterbox', 'Voxtral Clone']);
  const modelCounts = new Map<string, number>();
  for (const audio of audioYesterdayData) {
    const modelName = normalizeModelName(audio.model);
    if (cloneModelLabels.has(modelName)) {
      continue;
    }
    modelCounts.set(modelName, (modelCounts.get(modelName) ?? 0) + 1);
  }

  const sortedModelCounts = [...modelCounts.entries()].sort(
    ([, countA], [, countB]) => countB - countA,
  );
  const topModels = sortedModelCounts.slice(0, 3);
  const otherModels = sortedModelCounts.slice(3);
  const otherModelsCount = otherModels.reduce(
    (sum, [, count]) => sum + count,
    0,
  );

  const topVoiceList =
    modelCounts.size === 0
      ? 'N/A'
      : [
          ...topModels.map(([modelName, count]) => `${modelName} (${count})`),
          `other models ${otherModelsCount}`,
        ].join(', ');

  // Filter credit transactions by date ranges (purchases/top-ups only)
  const purchasePrevDayData = purchaseTransactions.filter(
    (transaction) =>
      transaction.created_at >= previousDay.toISOString() &&
      transaction.created_at < today.toISOString(),
  );
  const purchaseWeekData = purchaseTransactions.filter(
    (transaction) =>
      transaction.created_at >= sevenDaysAgo.toISOString() &&
      transaction.created_at < today.toISOString(),
  );
  const purchaseThirtyDayData = purchaseTransactions.filter(
    (transaction) =>
      transaction.created_at >= thirtyDaysAgo.toISOString() &&
      transaction.created_at < today.toISOString(),
  );
  const newSubscribersTodayCount = purchasePrevDayData.filter((transaction) => {
    if (transaction.type !== 'purchase') {
      return false;
    }

    if (!transaction.metadata || typeof transaction.metadata !== 'object') {
      return false;
    }

    return (
      (transaction.metadata as { isFirstSubscription?: boolean })
        .isFirstSubscription === true
    );
  }).length;
  const newSubscribersWeekCount = purchaseWeekData.filter((transaction) => {
    if (transaction.type !== 'purchase') {
      return false;
    }

    if (!transaction.metadata || typeof transaction.metadata !== 'object') {
      return false;
    }

    return (
      (transaction.metadata as { isFirstSubscription?: boolean })
        .isFirstSubscription === true
    );
  }).length;
  const creditsWeekCount = purchaseWeekData.length;
  const creditsMonthCount = purchaseThirtyDayData.length;
  const creditsTotalCount = purchaseTransactions.length;

  // Filter refund transactions by date ranges
  const refundsPrevDayData = refundTransactions.filter(
    (transaction) =>
      transaction.created_at >= previousDay.toISOString() &&
      transaction.created_at < today.toISOString(),
  );
  const refundsPrevCount = refundTransactions.filter(
    (transaction) =>
      transaction.created_at >= twoDaysAgo.toISOString() &&
      transaction.created_at < previousDay.toISOString(),
  ).length;
  const refundsTotalCount = refundTransactions.length;

  // Top customers calculation
  let hasInvalidMetadata = false;
  // Track individual transactions per customer for detailed display
  const customerTransactions = new Map<
    string,
    Array<{ amount: number; type: string; username: string }>
  >();

  for (const transaction of purchasePrevDayData) {
    if (
      !transaction.metadata ||
      typeof transaction.metadata !== 'object' ||
      typeof (transaction.metadata as { dollarAmount?: unknown })
        .dollarAmount !== 'number'
    ) {
      console.log('Invalid metadata in transaction:', transaction);
      hasInvalidMetadata = true;
      continue;
    }
    const { dollarAmount, isFirstTopup, isFirstSubscription } =
      transaction.metadata as {
        dollarAmount: number;
        isFirstTopup?: boolean;
        isFirstSubscription?: boolean;
      };

    // Determine purchase type label
    let purchaseTypeLabel = '';
    if (transaction.type === 'topup') {
      purchaseTypeLabel = isFirstTopup ? 'new topup' : 'existing topup';
    } else if (transaction.type === 'purchase') {
      purchaseTypeLabel = isFirstSubscription ? 'new sub' : 'existing sub';
    }

    // Store each transaction individually with username
    const existing = customerTransactions.get(transaction.user_id) ?? [];
    existing.push({
      amount: dollarAmount,
      type: purchaseTypeLabel,
      username: transaction.profiles?.username || 'Unknown',
    });
    customerTransactions.set(transaction.user_id, existing);
  }

  // Calculate total spending per customer for sorting
  const customerTotals = [...customerTransactions.entries()].map(
    ([userId, transactions]) => ({
      userId,
      total: transactions.reduce((sum, t) => sum + t.amount, 0),
      transactions,
      username: transactions[0].username,
    }),
  );

  const topCustomers = customerTotals
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const topCustomerIds = topCustomers.map((c) => c.userId);

  const topCustomersList =
    topCustomers.length === 0
      ? 'N/A'
      : topCustomers
          .map(({ username, transactions }) => {
            // Use username from customer totals - no need for inefficient find()
            const maskedUsername = maskUsername(username);

            // Format amounts: show individual amounts if multiple transactions
            // e.g., "$5+$5 topup" or "$5 topup + $10 sub" for mixed types
            const allSameType =
              transactions.length > 1 &&
              transactions.every((t) => t.type === transactions[0].type);

            let amountDisplay: string;
            if (transactions.length === 1) {
              // Single transaction: "$10.00 - existing topup"
              const t = transactions[0];
              amountDisplay = `$${t.amount} - ${t.type}`;
            } else if (allSameType) {
              // Multiple same-type: "$5+$5 topup"
              const amounts = transactions.map((t) => `$${t.amount}`).join('+');
              amountDisplay = `${amounts} ${transactions[0].type}`;
            } else {
              // Mixed types: "$5 topup + $10 sub"
              amountDisplay = transactions
                .map((t) => `$${t.amount} ${t.type}`)
                .join(' + ');
            }

            return `${maskedUsername} (${amountDisplay})`;
          })
          .join(', ');

  const topCustomerProfilesCount = topCustomerIds.length || '';

  const totalUniquePaidUsers = new Set(
    purchaseTransactions.map((t) => t.user_id),
  ).size;
  // Revenue calculations (incl. refund)
  const totalAmountUsd = creditTransactions.reduce(reduceAmountUsd, 0);

  const creditsPrevDayData = creditTransactions.filter(
    (transaction) =>
      transaction.created_at >= previousDay.toISOString() &&
      transaction.created_at < today.toISOString(),
  );
  const totalAmountUsdToday = creditsPrevDayData.reduce(reduceAmountUsd, 0);

  // 7-day revenue calculations
  const credits7dData = creditTransactions.filter(
    (transaction) =>
      transaction.created_at >= sevenDaysAgo.toISOString() &&
      transaction.created_at < today.toISOString(),
  );
  const total7dRevenue = credits7dData.reduce(reduceAmountUsd, 0);
  const avg7dRevenue = total7dRevenue / 7;

  // Refund amount calculations
  const totalRefundAmountUsd = refundTransactions.reduce(reduceAmountUsd, 0);
  const totalRefundAmountUsdToday = refundsPrevDayData.reduce(
    reduceAmountUsd,
    0,
  );

  // MTD revenue calculations (purchases/top-ups only)
  const mtdRevenueData = creditTransactions.filter(
    (transaction) =>
      transaction.created_at >= monthStart.toISOString() &&
      transaction.created_at < today.toISOString(),
  );
  const mtdRevenue = mtdRevenueData.reduce(reduceAmountUsd, 0);

  const prevMtdRevenueData = creditTransactions.filter(
    (transaction) =>
      transaction.created_at >= previousMonthStart.toISOString() &&
      transaction.created_at < previousMonthPeriodEnd.toISOString(),
  );
  const prevMtdRevenue = prevMtdRevenueData.reduce(reduceAmountUsd, 0);

  const twoMonthsAgoMtdRevenue = creditTransactions
    .filter(
      (transaction) =>
        transaction.created_at >= twoMonthsAgoStart.toISOString() &&
        transaction.created_at < twoMonthsAgoPeriodEnd.toISOString(),
    )
    .reduce(reduceAmountUsd, 0);

  const threeMonthsAgoMtdRevenue = creditTransactions
    .filter(
      (transaction) =>
        transaction.created_at >= threeMonthsAgoStart.toISOString() &&
        transaction.created_at < threeMonthsAgoPeriodEnd.toISOString(),
    )
    .reduce(reduceAmountUsd, 0);

  // Mean of the last 3 months' MTD revenue for comparison
  const avgPrevMtdRevenue =
    (prevMtdRevenue + twoMonthsAgoMtdRevenue + threeMonthsAgoMtdRevenue) / 3;

  const creditsTodayCount = purchasePrevDayData.length;
  const refundsTodayCount = refundsPrevDayData.length;

  // Paid user usage analysis
  // LRCV = Lowest Retail Credit Value
  const LRCV = 0.0004; // $0.0004 per credit
  const paidUserIds = new Set(purchaseTransactions.map((t) => t.user_id));
  const paidUserUsageEvents = usageEventsWeekData.filter((e) =>
    paidUserIds.has(e.user_id),
  );

  // Filter by date ranges
  const paidUserUsageYesterday = filterByDateRange(
    paidUserUsageEvents,
    previousDay,
    today,
    'occurred_at',
  );

  // DEBUG: Log paid user usage analysis
  if (!isProd) {
    // Get unique user IDs from yesterday's usage events
    const yesterdayUserIds = new Set(
      filterByDateRange(
        usageEventsWeekData,
        previousDay,
        today,
        'occurred_at',
      ).map((e) => e.user_id),
    );

    // Check overlap between paid users and yesterday's active users
    const paidUsersActiveYesterday = [...yesterdayUserIds].filter((id) =>
      paidUserIds.has(id),
    );

    console.log('\n🔍 DEBUG: Paid User Usage Analysis');
    console.log(
      '  - Date range:',
      previousDay.toISOString(),
      'to',
      today.toISOString(),
    );
    console.log('  - Total usage events (7d):', usageEventsWeekData.length);
    console.log('  - Total paid user IDs:', paidUserIds.size);
    console.log('  - Sample paid user IDs:', [...paidUserIds].slice(0, 3));
    console.log('  - Active users yesterday:', yesterdayUserIds.size);
    console.log(
      '  - Sample yesterday user IDs:',
      [...yesterdayUserIds].slice(0, 3),
    );
    console.log(
      '  - Paid users active yesterday:',
      paidUsersActiveYesterday.length,
    );
    console.log('  - Paid user usage events (7d):', paidUserUsageEvents.length);
    console.log(
      '  - Paid user usage events (yesterday):',
      paidUserUsageYesterday.length,
    );

    // Check if any yesterday user IDs match any paid user IDs (partial match check)
    if (paidUsersActiveYesterday.length === 0 && yesterdayUserIds.size > 0) {
      console.log('\n  ⚠️ NO OVERLAP between paid users and active users!');
      console.log('  - Checking ID format...');
      const samplePaidId = [...paidUserIds][0];
      const sampleActiveId = [...yesterdayUserIds][0];
      console.log(
        '  - Sample paid user ID:',
        samplePaidId,
        'length:',
        samplePaidId?.length,
      );
      console.log(
        '  - Sample active user ID:',
        sampleActiveId,
        'length:',
        sampleActiveId?.length,
      );
    }

    // Sample events for inspection
    if (usageEventsWeekData.length > 0) {
      console.log(
        '  - Sample usage event:',
        JSON.stringify(usageEventsWeekData[0], null, 2),
      );
    }
  }

  // Calculate usage breakdown by source_type
  const sourceTypeLabels: Partial<Record<UsageSourceType, string>> = {
    tts: 'TTS',
    voice_cloning: 'Cloning',
    live_call: 'Calls',
    audio_processing: 'Processing',
    api_tts: 'API TTS',
    api_voice_cloning: 'API Cloning',
  };

  const getSourceTypeLabel = (sourceType: string): string =>
    sourceTypeLabels[sourceType as UsageSourceType] ?? sourceType;

  const calculateUsageBreakdown = (
    events: typeof paidUserUsageEvents,
  ): Map<string, number> => {
    const breakdown = new Map<string, number>();
    for (const event of events) {
      const current = breakdown.get(event.source_type) ?? 0;
      breakdown.set(event.source_type, current + event.credits_used);
    }
    return breakdown;
  };

  const formatUsageBreakdown = (breakdown: Map<string, number>): string => {
    const total = [...breakdown.values()].reduce((sum, v) => sum + v, 0);
    if (total === 0) return 'No usage';

    return [...breakdown.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([type, credits]) => {
        const pct = ((credits / total) * 100).toFixed(0);
        return `${getSourceTypeLabel(type)}: ${formatCompactNumber(credits)} (${pct}%)`;
      })
      .join(' | ');
  };

  const usageYesterdayBreakdown = calculateUsageBreakdown(
    paidUserUsageYesterday,
  );
  const usageWeekBreakdown = calculateUsageBreakdown(paidUserUsageEvents);

  const totalCreditsYesterday = [...usageYesterdayBreakdown.values()].reduce(
    (sum, v) => sum + v,
    0,
  );
  const totalCreditsWeek = [...usageWeekBreakdown.values()].reduce(
    (sum, v) => sum + v,
    0,
  );

  // Dollar amounts based on LRCV
  const usageValueYesterday = totalCreditsYesterday * LRCV;
  const usageValueWeek = totalCreditsWeek * LRCV;

  const uniquePaidUsersYesterday = new Set(
    paidUserUsageYesterday.map((e) => e.user_id),
  ).size;
  const uniquePaidUsersWeek = new Set(paidUserUsageEvents.map((e) => e.user_id))
    .size;

  // Total active users yesterday (paid + free) from all usage events
  const usageEventsYesterday = filterByDateRange(
    usageEventsWeekData,
    previousDay,
    today,
    'occurred_at',
  );
  const totalActiveUsersYesterday = new Set(
    usageEventsYesterday.map((e) => e.user_id),
  ).size;

  // Active paid user rate: what % of active users yesterday were paid users
  const paidVsTotalActiveRate =
    totalActiveUsersYesterday > 0
      ? ((uniquePaidUsersYesterday / totalActiveUsersYesterday) * 100).toFixed(
          1,
        )
      : '0';

  // Comparison: Paid user usage (dollars) vs. Revenue purchased yesterday
  // If users are burning more value than they are buying, that's a signal (burn rate > 100%)
  const revenuePurchasedYesterday = purchasePrevDayData.reduce(
    (sum, t) =>
      sum +
      ((t.metadata as { dollarAmount?: number } | null)?.dollarAmount || 0),
    0,
  );

  // Both sides are in dollars: usageValueYesterday vs revenuePurchasedYesterday
  // If purchase is 0, ratio is infinite if usage > 0.
  let burnRateRatio = 0;
  if (revenuePurchasedYesterday > 0) {
    burnRateRatio = usageValueYesterday / revenuePurchasedYesterday;
  } else if (usageValueYesterday > 0) {
    burnRateRatio = Number.POSITIVE_INFINITY;
  }

  let burnRateFlag = '';
  if (burnRateRatio > 1.2) {
    const burnRateDisplay =
      revenuePurchasedYesterday > 0 ? `${burnRateRatio.toFixed(1)}x` : '∞';
    burnRateFlag = ` ⚠️ Burn rate: ${burnRateDisplay} vs purchased`;
  }

  // DEBUG: Credit calculation verification
  if (!isProd) {
    console.log('\n💰 DEBUG: Credit Calculation Verification');
    console.log(
      '  - Paid user usage events (yesterday):',
      paidUserUsageYesterday.length,
    );
    console.log('  - Total credits yesterday:', totalCreditsYesterday);
    console.log('  - Total credits week:', totalCreditsWeek);
    console.log('  - LRCV:', LRCV);
    console.log('  - Usage value yesterday: $', usageValueYesterday.toFixed(2));
    console.log('  - Usage value week: $', usageValueWeek.toFixed(2));
    // console.log('  - Avg credits/day (7d):', avgCreditsPerDay.toFixed(1));
    // console.log('  - Anomaly ratio:', usageAnomalyRatio.toFixed(2));
    console.log(
      '  - Burn rate ratio:',
      burnRateRatio === Number.POSITIVE_INFINITY
        ? 'Infinite'
        : burnRateRatio.toFixed(2),
    );
    console.log(
      '  - Breakdown yesterday:',
      Object.fromEntries(usageYesterdayBreakdown),
    );
    console.log('  - Breakdown week:', Object.fromEntries(usageWeekBreakdown));

    // Verify breakdown sums
    const breakdownSum = [...usageYesterdayBreakdown.values()].reduce(
      (a, b) => a + b,
      0,
    );
    console.log('  - Breakdown sum (should match total):', breakdownSum);

    // Show raw credits from events
    const rawCreditsSum = paidUserUsageYesterday.reduce(
      (sum, e) => sum + e.credits_used,
      0,
    );
    console.log('  - Raw credits sum from events:', rawCreditsSum);
  }

  // Top 3 paid users by credit consumption (yesterday)
  const userCreditUsage = new Map<string, number>();
  for (const event of paidUserUsageYesterday) {
    const current = userCreditUsage.get(event.user_id) ?? 0;
    userCreditUsage.set(event.user_id, current + event.credits_used);
  }

  const topUsageUsers = [...userCreditUsage.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  // Get usernames for top usage users from usage events
  const userIdToUsername = new Map<string, string>();
  for (const event of usageEventsWeekData) {
    if (event.profiles?.username && !userIdToUsername.has(event.user_id)) {
      userIdToUsername.set(event.user_id, event.profiles.username);
    }
  }

  // DEBUG: Top users verification
  if (!isProd) {
    console.log('\n👤 DEBUG: Top Users Verification');
    console.log('  - Total unique users with credits:', userCreditUsage.size);
    console.log('  - Top 3 raw data:');
    for (const [userId, credits] of topUsageUsers) {
      const username = userIdToUsername.get(userId) ?? 'Unknown';
      console.log(
        `    - ${username}: ${credits} credits ($${(credits * LRCV).toFixed(2)})`,
      );
    }
    // Sum of top 3
    const top3Sum = topUsageUsers.reduce((sum, [, c]) => sum + c, 0);
    console.log(
      '  - Sum of top 3:',
      top3Sum,
      `(${((top3Sum / totalCreditsYesterday) * 100).toFixed(1)}% of total)`,
    );
  }

  const topUsageUsersList =
    topUsageUsers.length === 0
      ? 'No usage'
      : topUsageUsers
          .map(([userId, credits]) => {
            const username = userIdToUsername.get(userId) ?? 'Unknown';
            const maskedName = maskUsername(username);
            const dollarValue = (credits * LRCV).toFixed(2);
            return `${maskedName} (${formatCompactNumber(credits)} ≈ $${dollarValue})`;
          })
          .join(', ');

  const revenueDeltaVsAvg = totalAmountUsdToday - avg7dRevenue;
  const revenueDeltaPctVsAvg =
    avg7dRevenue > 0 ? (revenueDeltaVsAvg / avg7dRevenue) * 100 : 0;
  const usageHighlights = [
    audioYesterdayCount > audioWeekCount / 7
      ? `Audio strong: ${audioYesterdayCount} vs ${(audioWeekCount / 7).toFixed(
          1,
        )} avg`
      : null,
    callsYesterdayCount > callsWeekCount / 7
      ? `Calls above trend: ${callsYesterdayCount} vs ${(
          callsWeekCount / 7
        ).toFixed(1)} avg`
      : null,
    clonePrevCount > cloneWeekCount / 7
      ? `Cloning above trend: ${clonePrevCount} vs ${(
          cloneWeekCount / 7
        ).toFixed(1)} avg`
      : null,
  ].filter(Boolean);

  const executiveSummaryLines = [
    `- Revenue ${revenueDeltaVsAvg >= 0 ? 'strong' : 'soft'}: $${totalAmountUsdToday.toFixed(2)} yesterday vs $${avg7dRevenue.toFixed(2)} 7d avg (${revenueDeltaVsAvg >= 0 ? '↑' : '↓'}${Math.abs(revenueDeltaPctVsAvg).toFixed(0)}%)`,
    `- Usage ${usageHighlights.length > 0 ? 'strong' : 'mixed'}: ${audioYesterdayCount} audios, ${callsYesterdayCount} calls, ${clonePrevCount} clones`,
    `- Monetization ${Number.parseFloat(paidVsTotalActiveRate) < 5 ? 'weak' : 'healthy'}: ${paidVsTotalActiveRate}% of active users are paid (${uniquePaidUsersYesterday}/${totalActiveUsersYesterday})`,
  ];

  const top3UsageCredits = topUsageUsers.reduce(
    (sum, [, credits]) => sum + credits,
    0,
  );
  const top3UsageSharePct =
    totalCreditsYesterday > 0
      ? ((top3UsageCredits / totalCreditsYesterday) * 100).toFixed(0)
      : '0';
  const top1UsageCredits = topUsageUsers[0]?.[1] ?? 0;
  const top1UsageSharePct =
    totalCreditsYesterday > 0
      ? ((top1UsageCredits / totalCreditsYesterday) * 100).toFixed(0)
      : '0';

  const alerts = [
    callsYesterdayCount === 0 ? 'Calls had no usage yesterday' : null,
    clonePrevCount === 0 ? 'Voice cloning had no usage yesterday' : null,
    apiTtsCreditsYesterday === 0 ? 'API TTS had no usage yesterday' : null,
    creditsTodayCount === 0 ? 'No purchases yesterday' : null,
    burnRateRatio > 1.2
      ? `Paid-user credit burn outpaced purchases (${revenuePurchasedYesterday > 0 ? `${burnRateRatio.toFixed(1)}x` : '∞'})`
      : null,
    totalCreditsYesterday > 0 && Number.parseFloat(top3UsageSharePct) >= 60
      ? `Paid usage is concentrated: top 3 users drove ${top3UsageSharePct}%`
      : null,
    profilesTodayCount >= 100 && creditsTodayCount === 0
      ? 'Strong signup day but no purchases'
      : null,
  ].filter(Boolean);

  const funnelActivationRate =
    profilesTodayCount > 0
      ? ((totalActiveUsersYesterday / profilesTodayCount) * 100).toFixed(1)
      : null;
  const funnelPaidActiveRate =
    totalActiveUsersYesterday > 0
      ? ((uniquePaidUsersYesterday / totalActiveUsersYesterday) * 100).toFixed(
          1,
        )
      : null;
  const funnelPurchaseRate =
    totalActiveUsersYesterday > 0
      ? ((creditsTodayCount / totalActiveUsersYesterday) * 100).toFixed(1)
      : null;

  const getFeatureHealthStatus = (
    current: number,
    baseline: number,
  ): '🟢 active' | '🟡 below trend' | '🔴 no usage' => {
    if (current === 0) return '🔴 no usage';
    if (baseline > 0 && current < baseline) return '🟡 below trend';
    return '🟢 active';
  };

  const featureHealthItems = [
    {
      label: 'TTS',
      status: getFeatureHealthStatus(
        usageYesterdayBreakdown.get('tts') ?? 0,
        (usageWeekBreakdown.get('tts') ?? 0) / 7,
      ),
      detail: `${formatCompactNumber(usageYesterdayBreakdown.get('tts') ?? 0)} credits`,
    },
    {
      label: 'API TTS',
      status: getFeatureHealthStatus(
        apiTtsCreditsYesterday,
        (usageWeekBreakdown.get('api_tts') ?? 0) / 7,
      ),
      detail: `${formatCompactNumber(apiTtsCreditsYesterday)} credits`,
    },
    {
      label: 'Calls',
      status: getFeatureHealthStatus(callsYesterdayCount, callsWeekCount / 7),
      detail: `${callsYesterdayCount} calls, ${formatDuration(callsDurationYesterday)}`,
    },
    {
      label: 'Cloning',
      status: getFeatureHealthStatus(clonePrevCount, cloneWeekCount / 7),
      detail: `${clonePrevCount} clones`,
    },
  ];

  const featureIssues = featureHealthItems.filter(
    (item) => item.status !== '🟢 active',
  );

  const featureHealthLines =
    featureIssues.length === 0
      ? []
      : [
          '',
          '🧩 Feature Health',
          ...featureIssues.map(
            (item) => `- ${item.label}: ${item.status} (${item.detail})`,
          ),
        ];

  const burnRateDisplay =
    revenuePurchasedYesterday > 0 ? `${burnRateRatio.toFixed(2)}x` : '∞';

  const concentrationRiskLines =
    totalCreditsYesterday === 0
      ? ['- No paid-user usage yesterday']
      : [
          `- Top 3 paid users drove ${top3UsageSharePct}% of yesterday's paid-user usage`,
          `- Top user drove ${top1UsageSharePct}% of paid-user usage`,
        ];

  const shouldShowConcentrationRisk =
    totalCreditsYesterday === 0 || Number.parseFloat(top3UsageSharePct) >= 60;

  const revenueSummaryLines = [
    `💰 Revenue: $${totalAmountUsdToday.toFixed(2)} yesterday (${totalAmountUsdToday >= avg7dRevenue ? '↑' : '↓'}$${Math.abs(totalAmountUsdToday - avg7dRevenue).toFixed(2)} vs 7d avg)`,
    `  - 7d: $${total7dRevenue.toFixed(2)} (avg $${avg7dRevenue.toFixed(2)}/day) | All-time: $${totalAmountUsd.toFixed(0)}`,
    `  - 3mo avg MTD: $${avgPrevMtdRevenue.toFixed(0)} vs MTD: $${mtdRevenue.toFixed(0)} (${formatCurrencyChange(mtdRevenue, avgPrevMtdRevenue)})`,
    `  - Subscribers: ${activeSubscribersCount} active | New subs: ${newSubscribersTodayCount} yesterday, ${newSubscribersWeekCount} in 7d | Next renewal: ${maskUsername(nextPayingSubscriber?.username)} on ${nextSubscriptionDueForPayment?.dueDate.slice(0, 10)}`,
  ];

  const message = [
    `📊 Daily Stats — ${previousDay.toISOString().slice(0, 10)}`,
    '',
    '🧠 Executive Summary',
    ...executiveSummaryLines,
    ...(alerts.length > 0
      ? ['', '🚨 Alerts', ...alerts.map((alert) => `- ${alert}`)]
      : []),
    '',
    '💸 Money Flow',
    `- Revenue collected yesterday: $${revenuePurchasedYesterday.toFixed(2)}`,
    `- Paid-user usage value: ≈ $${usageValueYesterday.toFixed(2)}`,
    `- Burn/revenue ratio: ${burnRateDisplay}`,
    '',
    '🔻 Funnel',
    `- New profiles: ${profilesTodayCount}`,
    `- Active users: ${totalActiveUsersYesterday}${funnelActivationRate ? ` (${funnelActivationRate}% of new profiles)` : ''}`,
    `- Paid active users: ${uniquePaidUsersYesterday}${funnelPaidActiveRate ? ` (${funnelPaidActiveRate}% of active users)` : ''}`,
    `- Credit transactions: ${creditsTodayCount}${funnelPurchaseRate ? ` (${funnelPurchaseRate}% of active users)` : ''}`,
    ...featureHealthLines,
    ...(shouldShowConcentrationRisk
      ? ['', '⚠️ Concentration Risk', ...concentrationRiskLines]
      : []),
    '',
    `📈 Paid User Usage: ${formatCompactNumber(totalCreditsYesterday)} credits ≈ $${usageValueYesterday.toFixed(2)}${burnRateFlag}`,
    `  - Mix: ${formatUsageBreakdown(usageYesterdayBreakdown)}`,
    `  - Top 3: ${topUsageUsersList}`,
    `  - 7d: ${formatCompactNumber(totalCreditsWeek)} credits ≈ $${usageValueWeek.toFixed(2)} (${uniquePaidUsersWeek} users, avg ${formatCompactNumber(totalCreditsWeek / 7)}/day ≈ $${(usageValueWeek / 7).toFixed(2)}/day)`,
    '',
    ...revenueSummaryLines,
    '',
    `🎧 Audio Files: ${audioYesterdayCount} (${formatChange(audioYesterdayCount, audioWeekCount / 7)})`,
    `  - 7d: ${audioWeekCount} (avg ${(audioWeekCount / 7).toFixed(1)})`,
    `  - Cloned: ${clonePrevCount} (${formatChange(clonePrevCount, cloneWeekCount / 7)}) | 7d: ${cloneWeekCount} (avg ${(cloneWeekCount / 7).toFixed(1)})`,
    `  - All-time: ${audioTotalCount.toLocaleString()}`,
    `  - Top models: ${topVoiceList}`,
    '',
    `📞 Calls: ${callsYesterdayCount} (${formatChange(callsYesterdayCount, callsWeekCount / 7)})`,
    `  - 7d: ${callsWeekCount} (avg ${(callsWeekCount / 7).toFixed(1)})`,
    `  - Duration: ${formatDuration(callsDurationYesterday)} (avg ${formatDuration(callsAvgDurationYesterday)}, ${formatDurationChange(callsAvgDurationYesterday, callsAvgDurationWeek)} vs 7d) | 7d: ${formatDuration(callsDurationWeek)} (avg ${formatDuration(callsAvgDurationWeek)})`,
    `  - Cost: $${callCostYesterday.toFixed(2)} yesterday | 7d: $${callCostWeek.toFixed(2)} (avg $${(callCostWeek / 7).toFixed(2)}/day)`,
    `  - All-time: ${callSessionsTotalCount.toLocaleString()} (avg ${formatDuration(callsAvgDurationAllTime)})`,
    '',
    `👤 New Profiles: ${profilesTodayCount} (${formatChange(profilesTodayCount, profilesWeekCount / 7)})`,
    `  - 7d: ${profilesWeekCount} (avg ${(profilesWeekCount / 7).toFixed(1)})`,
    `  - All-time: ${profilesTotalCount.toLocaleString()}`,
    '',
    `🔌 API: ${usedNewApiKeysCount} new key${usedNewApiKeysCount === 1 ? '' : 's'} | ${formatCompactNumber(apiTtsCreditsYesterday)} credits ≈ $${(apiTtsCreditsYesterday * LRCV).toFixed(2)}`,
    '',
    `💳 Credit Transactions: ${creditsTodayCount} (${formatChange(creditsTodayCount, creditsWeekCount / 7)}) ${creditsTodayCount > 0 ? '🤑' : '😿'}`,
    `  - 7d: ${creditsWeekCount} (avg ${(creditsWeekCount / 7).toFixed(1)}) | 30d: ${creditsMonthCount} (avg ${(creditsMonthCount / 30).toFixed(1)})`,
    `  - All-time: ${creditsTotalCount} | Unique Paid Users: ${totalUniquePaidUsers}`,
    `  - Top ${topCustomerProfilesCount}: ${topCustomersList}`,
    '',
    ...(refundsTodayCount > 0
      ? [
          `🔄 Refunds: ${refundsTodayCount} (${formatChange(refundsTodayCount, refundsPrevCount)}) 😢`,
          `  - Total: ${refundsTotalCount} | Amount: $${Math.abs(totalRefundAmountUsd).toFixed(2)} (Yesterday: $${Math.abs(totalRefundAmountUsdToday).toFixed(2)})`,
        ]
      : [
          `🔄 Refunds: 0 (Total: ${refundsTotalCount} | $${Math.abs(totalRefundAmountUsd).toFixed(2)})`,
        ]),
    ...(hasInvalidMetadata
      ? ['', '‼️ Info', '  - Invalid Metadata in credit_transactions']
      : []),
  ].join('\n');

  try {
    if (!isProd) {
      return new NextResponse(message);
    }
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: '202637584',
        text: message,
      }),
    });
    Sentry.captureCheckIn({
      // Make sure this variable is named `checkInId`
      checkInId,
      monitorSlug: 'telegram-bot-daily-stats',
      status: 'ok',
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    if (!isProd) {
      return NextResponse.json({
        error: 'Failed to send Telegram message',
      });
    }
    Sentry.captureException(error);
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: 'telegram-bot-daily-stats',
      status: 'error',
    });
  } finally {
    await Sentry.flush();
  }
}
