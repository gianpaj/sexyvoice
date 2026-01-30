import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  countActiveCustomerSubscriptions,
  findNextSubscriptionDueForPayment,
} from '@/lib/redis/queries';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserByStripeCustomerId } from '@/lib/supabase/queries';
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
  const previousDay = subtractDays(today, 1);
  const twoDaysAgo = subtractDays(today, 2);
  const sevenDaysAgo = subtractDays(today, 7);
  const thirtyDaysAgo = subtractDays(today, 30);
  // Use previousDay for MTD calculations since we're reporting on that day's month
  const monthStart = startOfMonth(previousDay);
  const previousMonthStart = startOfPreviousMonth(previousDay);

  // Calculate previous month period end for comparison
  // Cap at monthStart to avoid bleeding into the current month when prev month has fewer days
  const duration = today.getTime() - monthStart.getTime();
  const previousMonthPeriodEnd = new Date(
    Math.min(previousMonthStart.getTime() + duration, monthStart.getTime()),
  );

  // Fetch data in parallel - combine related queries and filter in memory
  const [
    // Audio files - fetch for last specific ranges
    audioYesterdayResult,
    audioWeekResult,
    audioTotalCountResult,
    clonesResult,
    profilesRecentResult,
    profilesTotalCountResult,
    allCreditTransactionsResult,
    activeSubscribersCount,
    nextSubscriptionDueForPayment,
    // Call sessions - fetch for last 7 days (includes yesterday)
    callSessionsWeekResult,
    callSessionsTotalCountResult,
    // Usage events for paid user analysis
    usageEventsWeekResult,
  ] = await Promise.all([
    // (audioYesterdayResult) Audio files yesterday with voice information
    supabase
      .from('audio_files')
      .select('id, created_at, model, voice_id, voices(name)')
      .gte('created_at', previousDay.toISOString())
      .lt('created_at', today.toISOString()),

    // (audioWeekResult) Audio files last 7 days
    supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo.toISOString())
      .lt('created_at', today.toISOString()),

    // (audioTotalCountResult) Total audio files count
    supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', today.toISOString()),

    // (clonesResult) Cloned audio files last 7 days (includes yesterday)
    supabase
      .from('audio_files')
      .select('id, created_at')
      .in('model', [
        'resemble-ai/chatterbox-multilingual',
        'resemble-ai/chatterbox',
      ])
      .gte('created_at', sevenDaysAgo.toISOString())
      .lt('created_at', today.toISOString()),

    // (profilesRecentResult) Profiles last 7 days (includes yesterday and previous day)
    supabase
      .from('profiles')
      .select('id, created_at, username')
      .gte('created_at', sevenDaysAgo.toISOString())
      .lt('created_at', today.toISOString()),

    // (profilesTotalCountResult) Total profiles count
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', today.toISOString()),

    // (allCreditTransactionsResult) Fetch all credit transactions (small dataset, excluding manual ones) with username join
    supabase
      .from('credit_transactions')
      .select(
        'id, user_id, created_at, type, description, metadata, profiles(username)',
      )
      .in('type', ['purchase', 'topup', 'refund'])
      .not('description', 'ilike', '%manual%')
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

    // (usageEventsWeekResult) Usage events last 7 days for paid user analysis
    supabase
      .from('usage_events')
      .select('id, user_id, source_type, credits_used, occurred_at')
      .gte('occurred_at', sevenDaysAgo.toISOString())
      .lt('occurred_at', today.toISOString()),
  ]);

  if (audioYesterdayResult.error) throw audioYesterdayResult.error;
  if (audioWeekResult.error) throw audioWeekResult.error;
  if (audioTotalCountResult.error) throw audioTotalCountResult.error;
  if (clonesResult.error) throw clonesResult.error;
  if (profilesRecentResult.error) throw profilesRecentResult.error;
  if (profilesTotalCountResult.error) throw profilesTotalCountResult.error;
  if (allCreditTransactionsResult.error)
    throw allCreditTransactionsResult.error;
  if (callSessionsWeekResult.error) throw callSessionsWeekResult.error;
  if (callSessionsTotalCountResult.error)
    throw callSessionsTotalCountResult.error;
  if (usageEventsWeekResult.error) throw usageEventsWeekResult.error;

  const audioYesterdayData = audioYesterdayResult.data ?? [];
  const audioYesterdayCount = audioYesterdayData.length;
  const audioWeekCount = audioWeekResult.count ?? 0;
  const audioTotalCount = audioTotalCountResult.count ?? 0;

  const clonesData = (clonesResult.data ?? []).filter(
    (item): item is { id: string; created_at: string } =>
      item.created_at !== null,
  );
  const profilesRecentData = (profilesRecentResult.data ?? []).filter(
    (item): item is { id: string; created_at: string; username: string } =>
      item.created_at !== null,
  );
  const profilesTotalCount = profilesTotalCountResult.count ?? 0;
  const creditTransactions = allCreditTransactionsResult.data ?? [];

  // Call sessions data processing
  const callSessionsWeekData = (callSessionsWeekResult.data ?? []).filter(
    (
      item,
    ): item is {
      id: string;
      started_at: string;
      duration_seconds: number;
      credits_used: number;
      status: string;
    } => item.started_at !== null,
  );
  const callSessionsTotalCount = callSessionsTotalCountResult.count ?? 0;
  const usageEventsWeekData = usageEventsWeekResult.data ?? [];

  // Filter call sessions by date ranges (using started_at as the date field)
  const callSessionsYesterdayData = filterByDateRange(
    callSessionsWeekData,
    previousDay,
    today,
    'started_at',
  );
  const callsYesterdayCount = callSessionsYesterdayData.length;
  const callsWeekCount = callSessionsWeekData.length;

  // Calculate total duration for yesterday and week
  const callsDurationYesterday = callSessionsYesterdayData.reduce(
    (sum, call) => sum + call.duration_seconds,
    0,
  );
  const callsDurationWeek = callSessionsWeekData.reduce(
    (sum, call) => sum + call.duration_seconds,
    0,
  );

  // Format duration in minutes
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
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

  // Top voices calculation
  const voiceCounts = new Map<string, number>();
  for (const audio of audioYesterdayData) {
    if (audio.voices?.name && audio.voices.name !== 'Cloned voice') {
      voiceCounts.set(
        audio.voices.name,
        (voiceCounts.get(audio.voices.name) ?? 0) + 1,
      );
    }
  }

  const topVoiceList =
    voiceCounts.size === 0
      ? 'N/A'
      : [...voiceCounts.entries()]
          .sort(([, countA], [, countB]) => countB - countA)
          .slice(0, 3)
          .map(([voiceName, count]) => `${voiceName} (${count})`)
          .join(', ');

  // Filter credit transactions by date ranges (purchases/top-ups only)
  const purchasePrevDayData = filterByDateRange(
    purchaseTransactions,
    previousDay,
    today,
  );
  const creditsWeekCount = filterByDateRange(
    purchaseTransactions,
    sevenDaysAgo,
    today,
  ).length;
  const creditsMonthCount = filterByDateRange(
    purchaseTransactions,
    thirtyDaysAgo,
    today,
  ).length;
  const creditsTotalCount = purchaseTransactions.length;

  // Filter refund transactions by date ranges
  const refundsPrevDayData = filterByDateRange(
    refundTransactions,
    previousDay,
    today,
  );
  const refundsPrevCount = filterByDateRange(
    refundTransactions,
    twoDaysAgo,
    previousDay,
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

  const creditsPrevDayData = filterByDateRange(
    creditTransactions,
    previousDay,
    today,
  );
  const totalAmountUsdToday = creditsPrevDayData.reduce(reduceAmountUsd, 0);

  // 7-day revenue calculations
  const credits7dData = filterByDateRange(
    creditTransactions,
    sevenDaysAgo,
    today,
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

  // Calculate usage breakdown by source_type
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

  const calculateUsageBreakdown = (
    events: typeof paidUserUsageEvents,
  ): Map<UsageSourceType, number> => {
    const breakdown = new Map<UsageSourceType, number>();
    for (const event of events) {
      const current = breakdown.get(event.source_type as UsageSourceType) ?? 0;
      breakdown.set(
        event.source_type as UsageSourceType,
        current + event.credits_used,
      );
    }
    return breakdown;
  };

  const formatUsageBreakdown = (
    breakdown: Map<UsageSourceType, number>,
  ): string => {
    const total = [...breakdown.values()].reduce((sum, v) => sum + v, 0);
    if (total === 0) return 'No usage';

    return [...breakdown.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([type, credits]) => {
        const pct = ((credits / total) * 100).toFixed(0);
        return `${sourceTypeLabels[type]}: ${formatCompactNumber(credits)} (${pct}%)`;
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

  // Anomaly detection: flag if yesterday is significantly above 7d avg (>2x)
  const avgCreditsPerDay = totalCreditsWeek / 7;
  const usageAnomalyRatio =
    avgCreditsPerDay > 0 ? totalCreditsYesterday / avgCreditsPerDay : 0;
  const usageAnomalyFlag =
    usageAnomalyRatio > 2 ? ` ⚠️ ${usageAnomalyRatio.toFixed(1)}x avg` : '';

  // Top 3 paid users by credit consumption (yesterday)
  const userCreditUsage = new Map<string, number>();
  for (const event of paidUserUsageYesterday) {
    const current = userCreditUsage.get(event.user_id) ?? 0;
    userCreditUsage.set(event.user_id, current + event.credits_used);
  }

  const topUsageUsers = [...userCreditUsage.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  // Get usernames for top usage users from purchaseTransactions
  const userIdToUsername = new Map<string, string>();
  for (const t of purchaseTransactions) {
    if (t.profiles?.username) {
      userIdToUsername.set(t.user_id, t.profiles.username);
    }
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

  const message = [
    `📊 Daily Stats — ${previousDay.toISOString().slice(0, 10)}`,
    '',
    `🎧 Audio Files: ${audioYesterdayCount} (${formatChange(audioYesterdayCount, audioWeekCount / 7)})`,
    `  - 7d: ${audioWeekCount} (avg ${(audioWeekCount / 7).toFixed(1)})`,
    `  - Cloned: ${clonePrevCount} (${formatChange(clonePrevCount, cloneWeekCount / 7)}) | 7d: ${cloneWeekCount} (avg ${(cloneWeekCount / 7).toFixed(1)})`,
    `  - All-time: ${audioTotalCount.toLocaleString()}`,
    `  - Top voices: ${topVoiceList}`,
    '',
    `📞 Calls: ${callsYesterdayCount} (${formatChange(callsYesterdayCount, callsWeekCount / 7)})`,
    `  - 7d: ${callsWeekCount} (avg ${(callsWeekCount / 7).toFixed(1)})`,
    `  - Duration: ${formatDuration(callsDurationYesterday)} (avg ${formatDuration(Math.round(callsDurationYesterday / callsYesterdayCount) || 0)}) | 7d: ${formatDuration(callsDurationWeek)} (avg ${formatDuration(Math.round(callsDurationWeek / callsWeekCount) || 0)})`,
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
          `  - Total: ${refundsTotalCount} | Amount: $${Math.abs(totalRefundAmountUsd).toFixed(2)} (Yesterday: $${Math.abs(totalRefundAmountUsdToday).toFixed(2)})`,
        ]
      : [
          `🔄 Refunds: 0 (Total: ${refundsTotalCount} | $${Math.abs(totalRefundAmountUsd).toFixed(2)})`,
        ]),
    '',
    `📈 Paid User Usage: ${formatCompactNumber(totalCreditsYesterday)} credits ≈ $${usageValueYesterday.toFixed(2)} (${uniquePaidUsersYesterday}/${totalActiveUsersYesterday} active users, ${paidVsTotalActiveRate}% paid)${usageAnomalyFlag}`,
    `  - ${formatUsageBreakdown(usageYesterdayBreakdown)}`,
    `  - Top 3: ${topUsageUsersList}`,
    `  - 7d: ${formatCompactNumber(totalCreditsWeek)} credits ≈ $${usageValueWeek.toFixed(2)} (${uniquePaidUsersWeek} users, avg ${formatCompactNumber(totalCreditsWeek / 7)}/day) | ${formatUsageBreakdown(usageWeekBreakdown)}`,
    '',
    '💰 Revenue',
    `  - Yesterday: $${totalAmountUsdToday.toFixed(2)} (${totalAmountUsdToday >= avg7dRevenue ? '↑' : '↓'}$${Math.abs(totalAmountUsdToday - avg7dRevenue).toFixed(2)} vs 7d avg)`,
    `  - All-time: $${totalAmountUsd.toFixed(0)} | 7d: $${total7dRevenue.toFixed(2)} (avg $${avg7dRevenue.toFixed(2)})`,
    `  - Prev MTD: $${prevMtdRevenue.toFixed(0)} vs MTD: $${mtdRevenue.toFixed(0)} (${formatCurrencyChange(mtdRevenue, prevMtdRevenue)})`,
    `  - Subscribers: ${activeSubscribersCount} active - next: ${maskUsername(nextPayingSubscriber?.username)} ${nextSubscriptionDueForPayment?.dueDate.slice(0, 10)}`,
    '',
    ...(hasInvalidMetadata
      ? [
          //
          '‼️ Info',
          '  - Invalid Metadata in credit_transactions',
        ]
      : []),
  ];

  try {
    if (!isProd) {
      return new NextResponse(message.join('\n'));
    }
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: '202637584',
        text: message.join('\n'),
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
