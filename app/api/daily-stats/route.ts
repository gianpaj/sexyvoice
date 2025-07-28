import * as Sentry from '@sentry/nextjs';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

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
  const clonePrevDay = await supabase
    .from('audio_files')
    .select('id', { count: 'exact', head: true })
    .eq('model', 'chatterbox-tts')
    .gte('created_at', previousDay.toISOString())
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

  const { data: creditsPrevDayData, count: creditsTodayCount } = await supabase
    .from('credit_transactions')
    .select('description', { count: 'exact' })
    .in('type', ['purchase', 'topup'])
    .gte('created_at', previousDay.toISOString())
    .lt('created_at', today.toISOString());

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
  const { data: creditsWeekData, count: creditsWeekCount } = await supabase
    .from('credit_transactions')
    .select('description', { count: 'exact' })
    .in('type', ['purchase', 'topup'])
    .gte('created_at', sevenDaysAgo.toISOString())
    .lt('created_at', today.toISOString());

  function extractDollarAmount(description: string): number {
    const dollarMatch = description.match(/\$([\d.]+)/);
    if (dollarMatch) return Number.parseFloat(dollarMatch[1]);
    const usdMatch = description.match(/^(\d+(?:\.\d+)?)\s*USD/);
    return usdMatch ? Number.parseFloat(usdMatch[1]) : 0;
  }

  const creditsTodayAmount =
    creditsPrevDayData?.reduce(
      (acc, t) => acc + extractDollarAmount(t.description),
      0,
    ) ?? 0;
  const creditsWeekAmount =
    creditsWeekData?.reduce(
      (acc, t) => acc + extractDollarAmount(t.description),
      0,
    ) ?? 0;

  const audioYesterdayCount = audioYesterday.count ?? 0;
  const audioPrevCount = audioPrev.count ?? 0;
  const audioWeekCount = audioWeek.count ?? 0;
  const cloneCount = clonePrevDay.count ?? 0;

  const profilesTodayCount = profilesPrevDay.count ?? 0;
  const profilesPrevCount = profilesPrev.count ?? 0;
  const profilesWeekCount = profilesWeek.count ?? 0;

  const creditsTodayCountNum = creditsTodayCount ?? 0;
  const creditsPrevCount = creditsPrev.count ?? 0;
  const creditsWeekCountNum = creditsWeekCount ?? 0;

  // const topVoiceList =
  //   topVoices.data?.map((v) => `${v.voices.name} (${v.count})`).join(', ') ??
  //   'N/A';

  const message = [
    `Daily stats for ${previousDay.toISOString().slice(0, 10)}`,
    `Audio files: ${audioYesterdayCount} (${formatChange(audioYesterdayCount, audioPrevCount)})`,
    `  - 7d total ${audioWeekCount}, avg ${(audioWeekCount / 7).toFixed(1)}`,
    `  - Clone voices: ${cloneCount}`,
    // `  - Top voices: ${topVoiceList}`,
    `Profiles: ${profilesTodayCount} (${formatChange(profilesTodayCount, profilesPrevCount)})`,
    `  - 7d total ${profilesWeekCount}, avg ${(profilesWeekCount / 7).toFixed(1)}`,
    `Credit Transactions: ${creditsTodayCountNum} (${formatChange(creditsTodayCountNum, creditsPrevCount)}) - $${creditsTodayAmount.toFixed(2)} ${creditsTodayCountNum > 0 ? '🤑' : '😿'}`,
    `  - 7d total ${creditsWeekCountNum}, avg ${(creditsWeekCountNum / 7).toFixed(1)} ($${creditsWeekAmount.toFixed(2)})`,
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
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: 'telegram-bot-daily-stats',
      status: 'error',
    });
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
