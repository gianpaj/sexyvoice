import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { countActiveCustomerSubscriptions } from '@/lib/redis/queries';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  filterByDateRange,
  formatChange,
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
  const monthStart = startOfMonth(untilNow);
  const previousMonthStart = startOfPreviousMonth(untilNow);

  // Calculate previous month period end for comparison
  const duration = today.getTime() - monthStart.getTime();
  const previousMonthPeriodEnd = new Date(
    previousMonthStart.getTime() + duration,
  );

  // Fetch data in parallel - combine related queries and filter in memory
  const [
    // Audio files - fetch for lastpecific ranges
    audioYesterdayResult,
    audioPreviousDayResult,
    audioWeekResult,
    audioTotalCountResult,
    clonesResult,
    // Profiles - fetch for specific ranges
    profilesRecentResult,
    profilesTotalCountResult,
    // Credit transactions - fetch all (small dataset)
    allCreditTransactionsResult,
    // Active subscribers
    activeSubscribersCount,
  ] = await Promise.all([
    // Audio files yesterday with voice information
    supabase
      .from('audio_files')
      .select('id, created_at, model, voice_id, voices(name)')
      .gte('created_at', previousDay.toISOString())
      .lt('created_at', today.toISOString()),

    // Audio files previous day (for comparison)
    supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', twoDaysAgo.toISOString())
      .lt('created_at', previousDay.toISOString()),

    // Audio files last 7 days
    supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo.toISOString())
      .lt('created_at', today.toISOString()),

    // Total audio files count
    supabase
      .from('audio_files')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', today.toISOString()),

    // Cloned audio files last 7 days (includes yesterday)
    supabase
      .from('audio_files')
      .select('id, created_at')
      .eq('model', 'chatterbox-tts')
      .gte('created_at', sevenDaysAgo.toISOString())
      .lt('created_at', today.toISOString()),

    // Profiles last 7 days (includes yesterday and previous day)
    supabase
      .from('profiles')
      .select('id, created_at, username')
      .gte('created_at', sevenDaysAgo.toISOString())
      .lt('created_at', today.toISOString()),

    // Total profiles count
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', today.toISOString()),

    // Fetch all credit transactions (small dataset, excluding manual ones) with username join
    supabase
      .from('credit_transactions')
      .select(
        'id, user_id, created_at, type, description, metadata, profiles(username)',
      )
      .in('type', ['purchase', 'topup'])
      .not('description', 'ilike', '%manual%')
      .lt('created_at', today.toISOString()),

    // Fetch active subscribers count
    countActiveCustomerSubscriptions(),
  ]);

  if (audioYesterdayResult.error) throw audioYesterdayResult.error;
  if (audioPreviousDayResult.error) throw audioPreviousDayResult.error;
  if (audioWeekResult.error) throw audioWeekResult.error;
  if (audioTotalCountResult.error) throw audioTotalCountResult.error;
  if (clonesResult.error) throw clonesResult.error;
  if (profilesRecentResult.error) throw profilesRecentResult.error;
  if (profilesTotalCountResult.error) throw profilesTotalCountResult.error;
  if (allCreditTransactionsResult.error)
    throw allCreditTransactionsResult.error;

  const audioYesterdayData = audioYesterdayResult.data ?? [];
  const audioYesterdayCount = audioYesterdayData.length;
  const audioPrevCount = audioPreviousDayResult.count ?? 0;
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
  const profilesPrevCount = filterByDateRange(
    profilesRecentData,
    twoDaysAgo,
    previousDay,
  ).length;
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

  // Top voices calculation
  const voiceCounts = new Map<string, number>();
  for (const audio of audioYesterdayData) {
    if (audio.voices?.name) {
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

  // Filter credit transactions by date ranges
  const creditsPrevDayData = filterByDateRange(
    creditTransactions,
    previousDay,
    today,
  );
  const creditsPrevCount = filterByDateRange(
    creditTransactions,
    twoDaysAgo,
    previousDay,
  ).length;
  const creditsWeekCount = filterByDateRange(
    creditTransactions,
    sevenDaysAgo,
    today,
  ).length;
  const creditsMonthCount = filterByDateRange(
    creditTransactions,
    thirtyDaysAgo,
    today,
  ).length;
  const creditsTotalCount = creditTransactions.length;

  // Top customers calculation
  let hasInvalidMetadata = false;
  const customerSpending = new Map<string, number>();

  for (const transaction of creditsPrevDayData) {
    if (!transaction.metadata || typeof transaction.metadata !== 'object') {
      console.log('Invalid metadata in transaction:', transaction);
      hasInvalidMetadata = true;
      continue;
    }
    const { dollarAmount } = transaction.metadata as {
      dollarAmount: number;
    };
    const currentSpending = customerSpending.get(transaction.user_id) ?? 0;
    customerSpending.set(transaction.user_id, currentSpending + dollarAmount);
  }

  const topCustomerIds = [...customerSpending.entries()]
    .sort(([, spendingA], [, spendingB]) => spendingB - spendingA)
    .slice(0, 3)
    .map(([userId]) => userId);

  const topCustomersList =
    topCustomerIds.length === 0
      ? 'N/A'
      : topCustomerIds
          .map((userId) => {
            // Find the transaction for this user to get their profile data
            const transaction = creditsPrevDayData.find(
              (t) => t.user_id === userId,
            );
            const username =
              maskUsername(transaction?.profiles?.username) || 'Unknown';
            const spending = customerSpending.get(userId) ?? 0;
            return `${username} ($${spending.toFixed(2)})`;
          })
          .join(', ');

  const topCustomerProfilesCount = topCustomerIds.length || '';

  // Revenue calculations
  const totalUniquePaidUsers = new Set(creditTransactions.map((t) => t.user_id))
    .size;
  const totalAmountUsd = creditTransactions.reduce(reduceAmountUsd, 0);
  const totalAmountUsdToday = creditsPrevDayData.reduce(reduceAmountUsd, 0);

  // MTD revenue calculations
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

  const creditsTodayCount = creditsPrevDayData.length;

  const message = [
    `📊 Daily Stats — ${previousDay.toISOString().slice(0, 10)}`,
    '',
    `🎧 Audio Files: ${audioYesterdayCount} (${formatChange(audioYesterdayCount, audioPrevCount)})`,
    `  - Cloned: ${clonePrevCount} | 7d: ${cloneWeekCount} (avg ${(cloneWeekCount / 7).toFixed(1)})`,
    `  - 7d Total: ${audioWeekCount} (avg ${(audioWeekCount / 7).toFixed(1)})`,
    `  - All-time: ${audioTotalCount.toLocaleString()}`,
    `  - Top voices: ${topVoiceList}`,
    '',
    `👤 New Profiles: ${profilesTodayCount} (${formatChange(profilesTodayCount, profilesPrevCount)})`,
    `  - 7d: ${profilesWeekCount} (avg ${(profilesWeekCount / 7).toFixed(1)})`,
    `  - All-time: ${profilesTotalCount.toLocaleString()}`,
    '',
    `💳 Credit Transactions: ${creditsTodayCount} (${formatChange(creditsTodayCount, creditsPrevCount)}) ${creditsTodayCount > 0 ? '🤑' : '😿'}`,
    `  - 7d: ${creditsWeekCount} (avg ${(creditsWeekCount / 7).toFixed(1)}) | 30d: ${creditsMonthCount} (avg ${(creditsMonthCount / 30).toFixed(1)})`,
    `  - Total: ${creditsTotalCount} | Unique Paid Users: ${totalUniquePaidUsers}`,
    `  - Top ${topCustomerProfilesCount} Customers: ${topCustomersList}`,
    '',
    '💰 Revenue',
    `  - All-time: $${totalAmountUsd.toFixed(2)}`,
    `  - Today: $${totalAmountUsdToday.toFixed(2)}`,
    `  - Prev MTD: $${prevMtdRevenue.toFixed(2)} vs MTD: $${mtdRevenue.toFixed(2)} (${formatCurrencyChange(mtdRevenue, prevMtdRevenue)})`,
    `  - Subscribers: ${activeSubscribersCount} active`,
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
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: 'telegram-bot-daily-stats',
      status: 'error',
    });
  }
}
