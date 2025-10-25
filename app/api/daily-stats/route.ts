import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { countActiveCustomerSubscriptions } from '@/lib/redis/queries';
import { createAdminClient } from '@/lib/supabase/admin';
import {
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

  const audioYesterday = await supabase
    .from('audio_files')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', previousDay.toISOString())
    .lt('created_at', today.toISOString());

  if (audioYesterday.count === 0) {
    const message = `WARNING: No audio files generated yesterday! ${previousDay}-${today}`;
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: '202637584', text: message }),
    });
    if (isProd) {
      Sentry.captureCheckIn({
        checkInId,
        monitorSlug: 'telegram-bot-daily-stats',
        status: 'ok',
      });
    }
    return NextResponse.json({ ok: true });
  }

  const audioPrev = await supabase
    .from('audio_files')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', twoDaysAgo.toISOString())
    .lt('created_at', previousDay.toISOString());
  const audioWeek = await supabase
    .from('audio_files')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sevenDaysAgo.toISOString())
    .lt('created_at', today.toISOString());
  const audioTotal = await supabase
    .from('audio_files')
    .select('id', { count: 'exact', head: true })
    .lt('created_at', today.toISOString());

  const clonePrevDay = await supabase
    .from('audio_files')
    .select('id', { count: 'exact', head: true })
    .eq('model', 'chatterbox-tts')
    .gte('created_at', previousDay.toISOString())
    .lt('created_at', today.toISOString());
  const cloneWeek = await supabase
    .from('audio_files')
    .select('id', { count: 'exact', head: true })
    .eq('model', 'chatterbox-tts')
    .gte('created_at', sevenDaysAgo.toISOString())
    .lt('created_at', today.toISOString());
  const { data: audioFilesYesterday } = await supabase
    .from('audio_files')
    .select(`
        voice_id,
        voices ( name )
      `)
    // .neq('model', 'chatterbox-tts')
    .gte('created_at', previousDay.toISOString())
    .lt('created_at', today.toISOString());

  const voiceCounts = new Map<string, number>();
  for (const row of audioFilesYesterday ?? []) {
    voiceCounts.set(
      row.voices.name,
      (voiceCounts.get(row.voices.name) ?? 0) + 1,
    );
  }

  const topVoiceEntries = [...voiceCounts.entries()]
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 3);

  const topVoiceList = await (async () => {
    if (topVoiceEntries.length === 0) {
      return 'N/A';
    }

    return topVoiceEntries
      .map(([voiceName, count]) => `${voiceName} (${count})`)
      .join(', ');
  })();
  const profilesPrevDay = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', previousDay.toISOString())
    .lt('created_at', today.toISOString());
  const profilesPrev = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', twoDaysAgo.toISOString())
    .lt('created_at', previousDay.toISOString());
  const profilesWeek = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sevenDaysAgo.toISOString())
    .lt('created_at', today.toISOString());
  const profilesTotal = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .lt('created_at', today.toISOString());

  const creditsPrevDay = await supabase
    .from('credit_transactions')
    .select('id, user_id, metadata, description')
    .in('type', ['purchase', 'topup'])
    .gte('created_at', previousDay.toISOString())
    .lt('created_at', today.toISOString())
    .not('description', 'ilike', '%manual%');

  let hasInvalidMetadata = false;

  // Get top 3 unique paying customers by total transactions (until now)
  // Calculate total spending per customer
  const customerSpending = new Map<string, number>();
  for (const transaction of creditsPrevDay.data ?? []) {
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

  // Get top 3 (max 3) customers by spending
  const topCustomerIds = [...customerSpending.entries()]
    .sort(([, spendingA], [, spendingB]) => spendingB - spendingA)
    .slice(0, 3)
    .map(([userId]) => userId);

  // Get profile data for top customers
  const { data: topCustomerProfiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', topCustomerIds);

  const topCustomerProfilesCount = topCustomerProfiles?.length ?? '';

  const topCustomersList = await (async () => {
    if (!topCustomerProfiles || topCustomerProfiles.length === 0) {
      return 'N/A';
    }

    // Preserve the spending order
    return topCustomerIds
      .map((userId) => {
        const profile = topCustomerProfiles.find((p) => p.id === userId);

        const username = maskUsername(profile?.username) || 'Unknown';
        const spending = customerSpending.get(userId) ?? 0;
        return `${username} ($${spending.toFixed(2)})`;
      })
      .join(', ');
  })();

  const creditsPrev = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['purchase', 'topup'])
    .gte('created_at', twoDaysAgo.toISOString())
    .lt('created_at', previousDay.toISOString())
    .not('description', 'ilike', '%manual%');

  const creditsWeek = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['purchase', 'topup'])
    .gte('created_at', sevenDaysAgo.toISOString())
    .lt('created_at', today.toISOString())
    .not('description', 'ilike', '%manual%');

  const creditsMonth = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['purchase', 'topup'])
    .gte('created_at', thirtyDaysAgo.toISOString())
    .lt('created_at', today.toISOString())
    .not('description', 'ilike', '%manual%');

  const creditsTotal = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['purchase', 'topup'])
    .lt('created_at', today.toISOString())
    .not('description', 'ilike', '%manual%');

  const { data: totalPaidUsersData } = await supabase
    .from('credit_transactions')
    .select('user_id, metadata')
    .in('type', ['purchase', 'topup'])
    .lt('created_at', today.toISOString())
    .not('description', 'ilike', '%manual%');

  const totalUniquePaidUsers = totalPaidUsersData
    ? new Set(totalPaidUsersData.map((t) => t.user_id)).size
    : 0;

  const totalAmountUsd = totalPaidUsersData?.reduce(reduceAmountUsd, 0) ?? 0;

  const { data: totalAmountUsdTodayData } = await supabase
    .from('credit_transactions')
    .select('metadata')
    .in('type', ['purchase', 'topup'])
    .gte('created_at', previousDay.toISOString())
    .lt('created_at', today.toISOString())
    .not('description', 'ilike', '%manual%');

  const totalAmountUsdToday =
    totalAmountUsdTodayData?.reduce(reduceAmountUsd, 0) ?? 0;

  // const { data: totalAmountUsdWeekData } = await supabase
  //   .from('credit_transactions')
  //   .select('metadata')
  //   .in('type', ['purchase', 'topup'])
  //   .gte('created_at', sevenDaysAgo.toISOString())
  //   .lt('created_at', today.toISOString());
  // const totalAmountUsdWeek =
  //   totalAmountUsdWeekData?.reduce(reduceAmountUsd, 0) ?? 0;

  // Month-to-date revenue (current month)
  const { data: mtdRevenueData } = await supabase
    .from('credit_transactions')
    .select('metadata')
    .in('type', ['purchase', 'topup'])
    .gte('created_at', monthStart.toISOString())
    .lt('created_at', today.toISOString())
    .not('description', 'ilike', '%manual%');

  const mtdRevenue = mtdRevenueData?.reduce(reduceAmountUsd, 0) ?? 0;

  // Previous month-to-date revenue (same day range in previous month)
  const duration = today.getTime() - monthStart.getTime();
  const previousMonthPeriodEnd = new Date(
    previousMonthStart.getTime() + duration,
  );

  const { data: prevMtdRevenueData } = await supabase
    .from('credit_transactions')
    .select('metadata')
    .in('type', ['purchase', 'topup'])
    .gte('created_at', previousMonthStart.toISOString())
    .lt('created_at', previousMonthPeriodEnd.toISOString())
    .not('description', 'ilike', '%manual%');

  const prevMtdRevenue = prevMtdRevenueData?.reduce(reduceAmountUsd, 0) ?? 0;

  const activeSubscribersCount = await countActiveCustomerSubscriptions();

  const audioYesterdayCount = audioYesterday.count ?? 0;
  const audioPrevCount = audioPrev.count ?? 0;
  const audioWeekCount = audioWeek.count ?? 0;
  const audioTotalCount = audioTotal.count ?? 0;

  const clonePrevCount = clonePrevDay.count ?? 0;
  const cloneWeekCount = cloneWeek.count ?? 0;

  const profilesTodayCount = profilesPrevDay.count ?? 0;
  const profilesPrevCount = profilesPrev.count ?? 0;
  const profilesWeekCount = profilesWeek.count ?? 0;
  const profilesTotalCount = profilesTotal.count ?? 0;

  const creditsTodayCount = creditsPrevDay.data?.length ?? 0;
  const creditsPrevCount = creditsPrev.count ?? 0;
  const creditsWeekCount = creditsWeek.count ?? 0;
  const creditsMonthCount = creditsMonth.count ?? 0;
  const creditsTotalCount = creditsTotal.count ?? 0;

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
    // `  - 7d: $${totalAmountUsdWeek.toFixed(2)} (avg $${(totalAmountUsdWeek / 7).toFixed(2)})`,
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
