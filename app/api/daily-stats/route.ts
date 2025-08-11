import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { countActiveCustomerSubscriptions } from '@/lib/redis/queries';
import { createAdminClient } from '@/lib/supabase/admin';

function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 86400_000);
}

function formatChange(today: number, yesterday: number): string {
  const diff = today - yesterday;
  return diff >= 0 ? `+${diff}` : `${diff}`;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', {
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

  const checkInId = Sentry.captureCheckIn({
    monitorSlug: 'telegram-bot-daily-stats',
    status: 'in_progress',
  });

  const supabase = createAdminClient();
  const now = new Date();
  const today = startOfDay(now);
  const previousDay = subtractDays(today, 1);
  const twoDaysAgo = subtractDays(today, 2);
  const sevenDaysAgo = subtractDays(today, 7);
  const thirtyDaysAgo = subtractDays(today, 30);

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
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: 'telegram-bot-daily-stats',
      status: 'ok',
    });
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
    .select('id', { count: 'exact', head: true });

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
  // const topVoices = await supabase
  //   .from('audio_files')
  //   .select('voice_id, voices(name), count:id')
  //   .gte('created_at', yesterday.toISOString())
  //   .lt('created_at', today.toISOString())
  //   .group('voice_id, voices(name)')
  //   .order('count', { ascending: false })
  //   .limit(3);

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
    .select('id', { count: 'exact', head: true });

  const creditsPrevDay = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['purchase', 'topup'])
    .gte('created_at', previousDay.toISOString())
    .lt('created_at', today.toISOString());
  // const { data: creditsPrevDayData } = await supabase
  //   .from('credit_transactions')
  //   .select('user_id, type, description')
  //   .in('type', ['purchase', 'topup'])
  //   .gte('created_at', previousDay.toISOString())
  //   .lt('created_at', today.toISOString());

  // Get unique user IDs who made purchases/topups
  // const userIds = creditsPrevDayData?.map((t) => t.user_id) || [];
  // const uniqueUserIds = [...new Set(userIds)];

  // Get profile data for those users
  // const { data: profilesData } = await supabase
  //   .from('profiles')
  //   .select('id, username')
  //   .in('id', uniqueUserIds);

  // console.log('Credit transactions:', creditsPrevDayData?.length);
  // console.log('Unique paying customers:', uniqueUserIds.length);
  // console.log(
  //   'Customer usernames:',
  //   profilesData?.map((p) => p.username).join(', '),
  // );

  const creditsPrev = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['purchase', 'topup'])
    .gte('created_at', twoDaysAgo.toISOString())
    .lt('created_at', previousDay.toISOString());
  const creditsWeek = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['purchase', 'topup'])
    .gte('created_at', sevenDaysAgo.toISOString())
    .lt('created_at', today.toISOString());

  const creditsMonth = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['purchase', 'topup'])
    .gte('created_at', thirtyDaysAgo.toISOString())
    .lt('created_at', today.toISOString());

  const creditsTotal = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['purchase', 'topup']);

  const { data: totalAmountUsdData } = await supabase
    .from('credit_transactions')
    .select('metadata')
    .in('type', ['purchase', 'topup']);

  const totalAmountUsd = totalAmountUsdData?.reduce(reduceAmountUsd, 0) ?? 0;

  const { data: totalAmountUsdWeekData } = await supabase
    .from('credit_transactions')
    .select('metadata')
    .in('type', ['purchase', 'topup'])
    .gte('created_at', sevenDaysAgo.toISOString())
    .lt('created_at', today.toISOString());
  const totalAmountUsdWeek =
    totalAmountUsdWeekData?.reduce(reduceAmountUsd, 0) ?? 0;

  const { data: totalAmountUsdMonthData } = await supabase
    .from('credit_transactions')
    .select('metadata')
    .in('type', ['purchase', 'topup'])
    .gte('created_at', thirtyDaysAgo.toISOString())
    .lt('created_at', today.toISOString());

  const totalAmountUsdMonth =
    totalAmountUsdMonthData?.reduce(reduceAmountUsd, 0) ?? 0;

  // const activeSubscribersData = await supabase
  //   .from('credit_transactions')
  //   .select('id', { count: 'exact', head: true })
  //   .eq('type', 'purchase');

  // const activeSubscribersCount = activeSubscribersData?.count ?? 0;

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

  const creditsTodayCount = creditsPrevDay.count ?? 0;
  const creditsPrevCount = creditsPrev.count ?? 0;
  const creditsWeekCount = creditsWeek.count ?? 0;
  const creditsMonthCount = creditsMonth.count ?? 0;
  const creditsTotalCount = creditsTotal.count ?? 0;

  // const topVoiceList =
  //   topVoices.data?.map((v) => `${v.voices.name} (${v.count})`).join(', ') ??
  //   'N/A';

  const message = [
    `Daily stats for ${previousDay.toISOString().slice(0, 10)}`,
    `Audio files: ${audioYesterdayCount} (${formatChange(audioYesterdayCount, audioPrevCount)} from yesterday)`,
    `  - Cloned voices: ${clonePrevCount}`,
    `  - 7d cloned: ${cloneWeekCount}, avg ${(cloneWeekCount / 7).toFixed(1)}`,
    `  - 7d total: ${audioWeekCount}, avg ${(audioWeekCount / 7).toFixed(1)}`,
    `  - Total: ${audioTotalCount}`,
    // `  - Top voices: ${topVoiceList}`,
    `Profiles: ${profilesTodayCount} (${formatChange(profilesTodayCount, profilesPrevCount)} from yesterday)`,
    `  - 7d total: ${profilesWeekCount}, avg ${(profilesWeekCount / 7).toFixed(1)}`,
    `  - Total: ${profilesTotalCount}`,
    `Credit Transactions: ${creditsTodayCount} (${formatChange(creditsTodayCount, creditsPrevCount)} from yesterday) ${creditsTodayCount > 0 ? '🤑' : '😿'}`,
    `  - 7d total: ${creditsWeekCount}, avg ${(creditsWeekCount / 7).toFixed(1)}`,
    `  - 30d total: ${creditsMonthCount}, avg ${(creditsMonthCount / 30).toFixed(1)}`,
    `  - Total: ${creditsTotalCount}`,
    `Total USD: $${totalAmountUsd.toFixed(2)}`,
    `  - 7d total: $${totalAmountUsdWeek.toFixed(2)}, avg $${(totalAmountUsdWeek / 7).toFixed(2)}`,
    `  - 30d total: $${totalAmountUsdMonth.toFixed(2)}, avg $${(totalAmountUsdMonth / 30).toFixed(2)}`,
    `  - num active subscribers: ${activeSubscribersCount}`,
  ];

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: '202637584', text: message.join('\n') }),
    });
    Sentry.captureCheckIn({
      // Make sure this variable is named `checkInId`
      checkInId,
      monitorSlug: 'telegram-bot-daily-stats',
      status: 'ok',
    });
    return NextResponse.json({ ok: true });

    // return new Response(message.join('\n'));
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    // Sentry.captureCheckIn({
    //   checkInId,
    //   monitorSlug: 'telegram-bot-daily-stats',
    //   status: 'error',
    // });
    return NextResponse.json({
      error: 'Failed to send Telegram message',
    });
  }

  // return NextResponse.json({
  //   body: {
  //     title: `Daily stats for ${previousDay.toISOString().slice(0, 10)}`,
  //     audio_files: { info: message[1], total: message[2], cloned: message[3] },
  //     profiles: { info: message[4], total: message[5] },
  //     credit_transactions: { info: message[6], total: message[7] },
  //   },
  // });
}
const reduceAmountUsd = (acc: number, row: { metadata: any }) => {
  if (!row.metadata || typeof row.metadata !== 'object') {
    return acc;
  }
  const { dollarAmount } = row.metadata as {
    priceId: string;
    dollarAmount: number;
  };
  if (typeof dollarAmount === 'number') {
    return acc + dollarAmount;
  }
  return acc;
};
