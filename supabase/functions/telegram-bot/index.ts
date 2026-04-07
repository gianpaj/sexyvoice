// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

console.log(`Function "telegram-bot" up and running!`);

import {
  Bot,
  webhookCallback,
} from 'https://deno.land/x/grammy@v1.36.3/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

const bot = new Bot(Deno.env.get('TELEGRAM_BOT_TOKEN') || '');

// Initialize Supabase client with admin access
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

// --- Helper Functions ---

function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86_400_000);
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function startOfPreviousMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
}

function formatChange(current: number, previous: number): string {
  const diff = current - previous;
  const formatted = diff % 1 === 0 ? diff.toString() : diff.toFixed(1);
  return diff >= 0 ? `+${formatted}` : `${formatted}`;
}

function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return num.toLocaleString();
}

function formatCurrencyChange(current: number, previous: number): string {
  const diff = current - previous;
  if (previous === 0) {
    if (current === 0) {
      return '→$0.00 (no change)';
    }
    return `↑$${current.toFixed(2)} (new)`;
  }
  const pct = (diff / previous) * 100;
  const arrow = diff >= 0 ? "↑" : "↓";

  return `${arrow}$${Math.abs(diff).toFixed(2)} (${arrow}${Math.abs(pct).toFixed(0)}%)`;
}

function maskUsername(username?: string): string | undefined {
  let maskedUsername = username;
  if (username?.includes('@')) {
    const [localPart, domain] = username.split('@');
    if (localPart.length > 6) {
      const first3 = localPart.slice(0, 3);
      const last3 = localPart.slice(-3);
      maskedUsername = `${first3}...${last3}@${domain}`;
    } else if (localPart.length > 3) {
      const first3 = localPart.slice(0, 3);
      maskedUsername = `${first3}...@${domain}`;
    } else {
      maskedUsername = `${localPart.slice(0, 1)}...@${domain}`;
    }
  }
  return maskedUsername;
}

// biome-ignore lint/suspicious/noExplicitAny: Metadata structure varies
function reduceAmountUsd(acc: number, row: { metadata: any }): number {
  if (!row.metadata || typeof row.metadata !== 'object') {
    return acc;
  }
  const { dollarAmount } = row.metadata as {
    dollarAmount: number;
  };
  if (typeof dollarAmount === 'number') {
    return acc + dollarAmount;
  }
  return acc;
}

function filterByDateRange<T>(
  items: T[],
  start: Date,
  end: Date,
  dateKey = 'created_at',
): T[] {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return items.filter((item) => {
    // @ts-expect-error: dynamic access
    const itemTime = new Date(item[dateKey] as string).getTime();
    return itemTime >= startTime && itemTime < endTime;
  });
}

// --- Stats Generation ---

async function generateTodayStats(): Promise<string> {
  const now = new Date();
  const today = startOfDay(now);
  const previousDay = subtractDays(today, 1);
  const sevenDaysAgo = subtractDays(today, 7);
  const thirtyDaysAgo = subtractDays(today, 30);
  const monthStart = startOfMonth(today);
  const previousMonthStart = startOfPreviousMonth(today);
  const twoMonthsAgoStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1),
  );
  const threeMonthsAgoStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 3, 1),
  );

  // Calculate previous month period ends for comparison
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

  try {
    // Parallel Fetching
    const [
      audioTodayResult,
      audioWeekResult,
      audioTotalCountResult,
      clonesResult,
      profilesRecentResult,
      profilesTotalCountResult,
      callSessionsWeekResult,
      callSessionsTotalCountResult,
      apiKeysTodayResult,
    ] = await Promise.all([
      // Audio files today
      supabase
        .from('audio_files')
        .select('id, created_at, model, voice_id, voices(name)')
        .gte('created_at', today.toISOString())
        .lt('created_at', now.toISOString()),

      // Audio files last 7 days
      supabase
        .from('audio_files')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sevenDaysAgo.toISOString())
        .lt('created_at', now.toISOString()),

      // Total audio files
      supabase
        .from('audio_files')
        .select('id', { count: 'exact', head: true })
        .lt('created_at', now.toISOString()),

      // Clones last 7 days (including today)
      supabase
        .from('audio_files')
        .select('id, created_at')
        .in('model', [
          'resemble-ai/chatterbox-multilingual',
          'resemble-ai/chatterbox',
          'voxtral-mini-tts-2603',
        ])
        .gte('created_at', sevenDaysAgo.toISOString())
        .lt('created_at', now.toISOString()),

      // Profiles last 7 days
      supabase
        .from('profiles')
        .select('id, created_at, username')
        .gte('created_at', sevenDaysAgo.toISOString())
        .lt('created_at', now.toISOString()),

      // Total profiles
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .lt('created_at', now.toISOString()),

      // Call sessions last 7 days
      supabase
        .from('call_sessions')
        .select('id, started_at, duration_seconds, credits_used, status')
        .gte('started_at', sevenDaysAgo.toISOString())
        .lt('started_at', now.toISOString()),

      // Total call sessions
      supabase
        .from('call_sessions')
        .select('id', { count: 'exact', head: true })
        .lt('started_at', now.toISOString()),

      // API keys created today with usage
      supabase
        .from('api_keys')
        .select('id, created_at, last_used_at')
        .gte('created_at', today.toISOString())
        .lt('created_at', now.toISOString()),
    ]);

    // Fetch credit transactions with pagination (to avoid 1000-row cap)
    const allCreditTransactions: {
      id: string;
      user_id: string;
      created_at: string;
      type: string;
      description: string | null;
      // biome-ignore lint/suspicious/noExplicitAny: Metadata structure varies
      metadata: any;
      profiles: { username: string } | null;
    }[] = [];
    {
      const pageSize = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from('credit_transactions')
          .select(
            'id, user_id, created_at, type, description, metadata, profiles(username)',
          )
          .in('type', ['purchase', 'topup', 'refund'])
          .not('description', 'ilike', '%manual%')
          .lt('created_at', now.toISOString())
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allCreditTransactions.push(...data);
          offset += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }
    }

    // Fetch usage events with pagination
    // biome-ignore lint/suspicious/noExplicitAny: it's ok
    const allUsageEvents: any[] = [];
    {
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
          .lt('occurred_at', now.toISOString())
          .order('occurred_at', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allUsageEvents.push(...data);
          offset += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }
    }

    // --- Processing ---

    // Audio
    const audioTodayData = audioTodayResult.data ?? [];
    const audioTodayCount = audioTodayData.length;
    const audioWeekCount = audioWeekResult.count ?? 0;
    const audioTotalCount = audioTotalCountResult.count ?? 0;

    // Clones
    const clonesData = clonesResult.data ?? [];
    const cloneTodayCount = filterByDateRange(clonesData, today, now).length;
    const cloneWeekCount = clonesData.length;

    // Profiles
    const profilesRecentData = profilesRecentResult.data ?? [];
    const profilesTodayData = filterByDateRange(profilesRecentData, today, now);
    const profilesTodayCount = profilesTodayData.length;
    const profilesWeekCount = profilesRecentData.length;
    const profilesTotalCount = profilesTotalCountResult.count ?? 0;

    // Calls
    const callSessionsWeekData = (callSessionsWeekResult.data ?? []).filter(
      (c) => c.started_at !== null,
    );
    const callSessionsTodayData = filterByDateRange(
      callSessionsWeekData,
      today,
      now,
      'started_at',
    );
    const callsTodayCount = callSessionsTodayData.length;
    const callsWeekCount = callSessionsWeekData.length;
    const callSessionsTotalCount = callSessionsTotalCountResult.count ?? 0;

    // API keys
    const apiKeysTodayData = (apiKeysTodayResult.data ?? []) as {
      id: string;
      created_at: string;
      last_used_at: string | null;
    }[];
    const usedNewApiKeysCount = apiKeysTodayData.filter(
      (key) => key.last_used_at !== null,
    ).length;

    // API TTS credits used today
    const apiTtsCreditsToday = filterByDateRange(
      allUsageEvents,
      today,
      now,
      'occurred_at',
    )
      .filter((e) => e.source_type === 'api_tts')
      .reduce((sum: number, e: any) => sum + e.credits_used, 0);

    const callsDurationToday = callSessionsTodayData.reduce(
      (sum: number, call: any) => sum + call.duration_seconds,
      0,
    );
    const callsDurationWeek = callSessionsWeekData.reduce(
      (sum: number, call: any) => sum + call.duration_seconds,
      0,
    );

    const formatDuration = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    // Credit Transactions
    const creditTransactions = allCreditTransactions;
    const refundTransactions = creditTransactions.filter(
      (t) => t.type === 'refund',
    );
    const purchaseTransactions = creditTransactions.filter(
      (t) => t.type !== 'refund',
    );

    const purchaseTodayData = filterByDateRange(
      purchaseTransactions,
      today,
      now,
    );
    const creditsWeekCount = filterByDateRange(
      purchaseTransactions,
      sevenDaysAgo,
      now,
    ).length;
    const creditsMonthCount = filterByDateRange(
      purchaseTransactions,
      thirtyDaysAgo,
      now,
    ).length;
    const creditsTotalCount = purchaseTransactions.length;

    // Refunds
    const refundsTodayData = filterByDateRange(refundTransactions, today, now);
    const refundsPrevCount = filterByDateRange(
      refundTransactions,
      previousDay,
      today,
    ).length;
    const refundsTodayCount = refundsTodayData.length;
    const refundsTotalCount = refundTransactions.length;
    const totalRefundAmountUsd = refundTransactions.reduce(reduceAmountUsd, 0);
    const totalRefundAmountUsdToday = refundsTodayData.reduce(
      reduceAmountUsd,
      0,
    );

    // Revenue
    const totalAmountUsd = creditTransactions.reduce(reduceAmountUsd, 0);
    const totalAmountUsdToday = filterByDateRange(
      creditTransactions,
      today,
      now,
    ).reduce(reduceAmountUsd, 0);

    const credits7dData = filterByDateRange(
      creditTransactions,
      sevenDaysAgo,
      now,
    );
    const total7dRevenue = credits7dData.reduce(reduceAmountUsd, 0);
    const avg7dRevenue = total7dRevenue / 7;

    const mtdRevenueData = filterByDateRange(
      creditTransactions,
      monthStart,
      today,
    );
    const mtdRevenue = mtdRevenueData.reduce(reduceAmountUsd, 0);

    const prevMtdRevenueData = filterByDateRange(
      creditTransactions,
      previousMonthStart,
      previousMonthPeriodEnd,
    );
    const prevMtdRevenue = prevMtdRevenueData.reduce(reduceAmountUsd, 0);

    const twoMonthsAgoMtdRevenue = filterByDateRange(
      creditTransactions,
      twoMonthsAgoStart,
      twoMonthsAgoPeriodEnd,
    ).reduce(reduceAmountUsd, 0);

    const threeMonthsAgoMtdRevenue = filterByDateRange(
      creditTransactions,
      threeMonthsAgoStart,
      threeMonthsAgoPeriodEnd,
    ).reduce(reduceAmountUsd, 0);

    const avgPrevMtdRevenue =
      (prevMtdRevenue + twoMonthsAgoMtdRevenue + threeMonthsAgoMtdRevenue) / 3;

    const creditsTodayCount = purchaseTodayData.length;
    const totalUniquePaidUsers = new Set(
      purchaseTransactions.map((t) => t.user_id),
    ).size;

    // Usage Analysis
    const LRCV = 0.0004;
    const paidUserIds = new Set(purchaseTransactions.map((t) => t.user_id));
    const paidUserUsageEvents = allUsageEvents.filter((e) =>
      paidUserIds.has(e.user_id),
    );

    const paidUserUsageToday = filterByDateRange(
      paidUserUsageEvents,
      today,
      now,
      'occurred_at',
    );

    const usageEventsToday = filterByDateRange(
      allUsageEvents,
      today,
      now,
      'occurred_at',
    );
    const totalActiveUsersToday = new Set(
      usageEventsToday.map((e) => e.user_id),
    ).size;
    const uniquePaidUsersToday = new Set(
      paidUserUsageToday.map((e) => e.user_id),
    ).size;
    const uniquePaidUsersWeek = new Set(
      paidUserUsageEvents.map((e) => e.user_id),
    ).size;

    const paidVsTotalActiveRate =
      totalActiveUsersToday > 0
        ? ((uniquePaidUsersToday / totalActiveUsersToday) * 100).toFixed(1)
        : '0';

    // Burn rate: paid user usage (dollars) vs revenue purchased today
    const revenuePurchasedToday = purchaseTodayData.reduce(
      (sum: number, t: any) =>
        sum + ((t.metadata as { dollarAmount?: number } | null)?.dollarAmount || 0),
      0,
    );

    // Usage Breakdown
    type UsageSourceType =
      | 'tts'
      | 'voice_cloning'
      | 'live_call'
      | 'audio_processing';
    const sourceTypeLabels: Record<UsageSourceType, string> = {
      tts: 'TTS',
      voice_cloning: 'Cloning',
      live_call: 'Calls',
      audio_processing: 'Processing',
    };

    const calculateUsageBreakdown = (events: any[]): Map<string, number> => {
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
          const label = sourceTypeLabels[type] || type;
          return `${label}: ${formatCompactNumber(credits)} (${pct}%)`;
        })
        .join(' | ');
    };

    const usageTodayBreakdown = calculateUsageBreakdown(paidUserUsageToday);
    const usageWeekBreakdown = calculateUsageBreakdown(paidUserUsageEvents);

    const totalCreditsToday = [...usageTodayBreakdown.values()].reduce(
      (sum, v) => sum + v,
      0,
    );
    const totalCreditsWeek = [...usageWeekBreakdown.values()].reduce(
      (sum, v) => sum + v,
      0,
    );

    const usageValueToday = totalCreditsToday * LRCV;
    const usageValueWeek = totalCreditsWeek * LRCV;

    // Burn rate: usage value vs revenue purchased today (both in dollars)
    const burnRateRatio =
      revenuePurchasedToday > 0
        ? usageValueToday / revenuePurchasedToday
        : usageValueToday > 0
          ? Number.POSITIVE_INFINITY
          : 0;

    const burnRateFlag =
      burnRateRatio > 1.2
        ? ` ⚠️ Burn rate: ${revenuePurchasedToday > 0 ? `${burnRateRatio.toFixed(1)}x` : '∞'} vs purchased`
        : '';

    // Top non-clone models
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
    for (const audio of audioTodayData) {
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
    const otherModelsPreview =
      otherModels.length === 0
        ? 'none'
        : otherModels
          .slice(0, 10)
          .map(([modelName, count]) => `${modelName} (${count})`)
          .join(', ');

    const topModelList =
      modelCounts.size === 0
        ? 'N/A'
        : [
          ...topModels.map(([modelName, count]) => `${modelName} (${count})`),
          `other models (${otherModelsCount}: ${otherModelsPreview})`,
        ].join(', ');

    // Top Customers
    let hasInvalidMetadata = false;
    const customerTransactions = new Map<
      string,
      Array<{ amount: number; type: string; username: string }>
    >();

    for (const transaction of purchaseTodayData) {
      if (
        !transaction.metadata ||
        typeof transaction.metadata !== 'object' ||
        typeof transaction.metadata.dollarAmount !== 'number'
      ) {
        hasInvalidMetadata = true;
        continue;
      }
      const { dollarAmount, isFirstTopup, isFirstSubscription } =
        transaction.metadata as any;

      let purchaseTypeLabel = '';
      if (transaction.type === 'topup') {
        purchaseTypeLabel = isFirstTopup ? 'new topup' : 'existing topup';
      } else if (transaction.type === 'purchase') {
        purchaseTypeLabel = isFirstSubscription ? 'new sub' : 'existing sub';
      }

      const existing = customerTransactions.get(transaction.user_id) ?? [];
      existing.push({
        amount: dollarAmount,
        type: purchaseTypeLabel,
        username: transaction.profiles?.username || 'Unknown',
      });
      customerTransactions.set(transaction.user_id, existing);
    }

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

    const topCustomersList =
      topCustomers.length === 0
        ? 'N/A'
        : topCustomers
          .map(({ username, transactions }) => {
            const maskedUsername = maskUsername(username);
            const allSameType =
              transactions.length > 1 &&
              transactions.every((t) => t.type === transactions[0].type);

            let amountDisplay: string;
            if (transactions.length === 1) {
              const t = transactions[0];
              amountDisplay = `$${t.amount} - ${t.type}`;
            } else if (allSameType) {
              const amounts = transactions
                .map((t) => `$${t.amount}`)
                .join('+');
              amountDisplay = `${amounts} ${transactions[0].type}`;
            } else {
              amountDisplay = transactions
                .map((t) => `$${t.amount} ${t.type}`)
                .join(' + ');
            }
            return `${maskedUsername} (${amountDisplay})`;
          })
          .join(', ');

    const topCustomerProfilesCount =
      topCustomers.length > 0 ? topCustomers.length.toString() : 'customers';

    // Top Usage Users
    const userCreditUsage = new Map<string, number>();
    for (const event of paidUserUsageToday) {
      const current = userCreditUsage.get(event.user_id) ?? 0;
      userCreditUsage.set(event.user_id, current + event.credits_used);
    }

    const userIdToUsername = new Map<string, string>();
    for (const event of allUsageEvents) {
      if (event.profiles?.username && !userIdToUsername.has(event.user_id)) {
        userIdToUsername.set(event.user_id, event.profiles.username);
      }
    }

    const topUsageUsers = [...userCreditUsage.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

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

    const message = [
      `📊 Daily Stats — ${today.toISOString().slice(0, 10)} (Today)`,
      '',
      `🎧 Audio Files: ${audioTodayCount} (${formatChange(audioTodayCount, audioWeekCount / 7)})`,
      `  - 7d: ${audioWeekCount} (avg ${(audioWeekCount / 7).toFixed(1)})`,
      `  - Cloned: ${cloneTodayCount} (${formatChange(cloneTodayCount, cloneWeekCount / 7)}) | 7d: ${cloneWeekCount} (avg ${(cloneWeekCount / 7).toFixed(1)})`,
      `  - All-time: ${audioTotalCount.toLocaleString()}`,
      `  - Top models: ${topModelList}`,
      '',
      `📞 Calls: ${callsTodayCount} (${formatChange(callsTodayCount, callsWeekCount / 7)})`,
      `  - 7d: ${callsWeekCount} (avg ${(callsWeekCount / 7).toFixed(1)})`,
      `  - Duration: ${formatDuration(callsDurationToday)} (avg ${formatDuration(callsTodayCount > 0 ? Math.round(callsDurationToday / callsTodayCount) : 0)}) | 7d: ${formatDuration(callsDurationWeek)} (avg ${formatDuration(callsWeekCount > 0 ? Math.round(callsDurationWeek / callsWeekCount) : 0)})`,
      `  - All-time: ${callSessionsTotalCount.toLocaleString()}`,
      '',
      `👤 New Profiles: ${profilesTodayCount} (${formatChange(profilesTodayCount, profilesWeekCount / 7)})`,
      `  - 7d: ${profilesWeekCount} (avg ${(profilesWeekCount / 7).toFixed(1)})`,
      `  - All-time: ${profilesTotalCount.toLocaleString()}`,
      '',
      `💳 Credit Transactions: ${creditsTodayCount} (${formatChange(creditsTodayCount, creditsWeekCount / 7)}) ${creditsTodayCount > 0 ? '🤑' : '😿'}`,
      `  - 7d: ${creditsWeekCount} (avg ${(creditsWeekCount / 7).toFixed(1)}) | 30d: ${creditsMonthCount} (avg ${(creditsMonthCount / 30).toFixed(1)})`,
      `  - All-time: ${creditsTotalCount} | Unique Paid Users: ${totalUniquePaidUsers}`,
      `  - Top ${topCustomerProfilesCount}: ${topCustomersList}`,
      '',
      ...(refundsTodayCount > 0
        ? [
          `🔄 Refunds: ${refundsTodayCount} (${formatChange(refundsTodayCount, refundsPrevCount)}) 😢`,
          `  - Total: ${refundsTotalCount} | Amount: $${Math.abs(totalRefundAmountUsd).toFixed(2)} (Today: $${Math.abs(totalRefundAmountUsdToday).toFixed(2)})`,
        ]
        : [
          `🔄 Refunds: 0 (Total: ${refundsTotalCount} | $${Math.abs(totalRefundAmountUsd).toFixed(2)})`,
        ]),
      '',
      '🔌 API:',
      `  - Used Keys (new): ${usedNewApiKeysCount}`,
      `  - TTS Usage: ${formatCompactNumber(apiTtsCreditsToday)} credits ≈ $${(apiTtsCreditsToday * LRCV).toFixed(2)}`,
      '',
      `📈 Paid User Usage: ${formatCompactNumber(totalCreditsToday)} credits ≈ $${usageValueToday.toFixed(2)} (${uniquePaidUsersToday}/${totalActiveUsersToday} active users, ${paidVsTotalActiveRate}% paid)${burnRateFlag}`,
      `  - ${formatUsageBreakdown(usageTodayBreakdown)}`,
      `  - Top 3: ${topUsageUsersList}`,
      `  - 7d: ${formatCompactNumber(totalCreditsWeek)} credits ≈ $${usageValueWeek.toFixed(2)} (${uniquePaidUsersWeek} users, avg ${formatCompactNumber(totalCreditsWeek / 7)}/day) | ${formatUsageBreakdown(usageWeekBreakdown)}`,
      '',
      '💰 Revenue',
      `  - Today: $${totalAmountUsdToday.toFixed(2)} (${totalAmountUsdToday >= avg7dRevenue ? '↑' : '↓'}$${Math.abs(totalAmountUsdToday - avg7dRevenue).toFixed(2)} vs 7d avg)`,
      `  - All-time: $${totalAmountUsd.toFixed(0)} | 7d: $${total7dRevenue.toFixed(2)} (avg $${avg7dRevenue.toFixed(2)})`,
      `  - 3mo avg MTD: $${avgPrevMtdRevenue.toFixed(0)} vs MTD: $${mtdRevenue.toFixed(0)} (${formatCurrencyChange(mtdRevenue, avgPrevMtdRevenue)})`,
      // Subscribers info not available in Deno without extra implementation
      '',
      ...(hasInvalidMetadata
        ? [
          '‼️ Info',
          '  - Invalid Metadata in credit_transactions',
        ]
        : []),
    ];

    return message.join('\n');
  } catch (error) {
    console.error('Error generating stats:', error);
    return '❌ Error fetching stats from database. Please try again later.';
  }
}

bot.command('start', (ctx) => ctx.reply('Welcome! Up and running.'));

bot.command('ping', async (ctx) => {
  console.log('ping command received', ctx.chat.id, ctx.from?.id);
  await ctx.reply(`Pong! ${new Date()} ${Date.now()}`);
});

bot.command('stats', async (ctx) => {
  console.log('stats command received', ctx.chat.id, ctx.from?.id);
  try {
    const msg = await ctx.reply('📈 Generating stats...');
    const statsMessage = await generateTodayStats();
    await bot.api.editMessageText(ctx.chatId, msg.message_id, statsMessage);
  } catch (error) {
    console.error('Error in stats command:', error);
    await ctx.reply('❌ Failed to generate stats. Please try again later.');
  }
});

bot.command('menu', async (ctx) => {
  const mainMenuOptions = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Help',
            callback_data: 'help',
          },
        ],
        [
          {
            text: 'Stats 📊',
            callback_data: 'stats',
          },
        ],
        [
          {
            text: 'About',
            callback_data: 'about',
          },
        ],
      ],
    },
  };

  await ctx.reply('Choose an option:', mainMenuOptions);
});

bot.command('help', async (ctx) => {
  await ctx.reply(helpText);
});

const helpText = `🤖 Available commands:
/start - Welcome message
/ping - Test bot responsiveness
/stats - Get daily platform statistics
/menu - Show interactive menu

Use /stats to get detailed analytics about the platform.`;

// Handle callback queries from inline keyboard
bot.on('callback_query', async (ctx) => {
  const callbackData = ctx.callbackQuery.data;

  await ctx.answerCallbackQuery();

  switch (callbackData) {
    case 'help':
      await ctx.reply(helpText);
      break;
    case 'stats': {
      await ctx.reply('📈 Generating stats...');
      const statsMessage = await generateTodayStats();
      await ctx.reply(statsMessage);
      break;
    }
    case 'about':
      await ctx.reply(`🎤 SexyVoice.ai Admin Bot

This bot provides real-time statistics and updates for the SexyVoice.ai platform.

Visit: https://sexyvoice.ai`);
      break;
    default:
      await ctx.reply('Unknown option selected.');
  }
});

const handleUpdate = webhookCallback(bot, 'std/http', {
  onTimeout: () => {
    console.log('Timeout occurred');
  },
});

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get('secret') !== Deno.env.get('FUNCTION_SECRET')) {
      return new Response('not allowed', { status: 405 });
    }

    return await handleUpdate(req);
  } catch (err) {
    console.error(err);
    return new Response('Internal Server Error', { status: 500 });
  }
});
