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
    .eq('model', 'clone')
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

  const creditsPrevDay = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['purchase', 'topup'])
    .gte('created_at', previousDay.toISOString())
    .lt('created_at', today.toISOString());
  const { data: creditsPrevDayData } = await supabase
    .from('credit_transactions')
    .select('user_id, type, description')
    .in('type', ['purchase', 'topup'])
    .gte('created_at', previousDay.toISOString())
    .lt('created_at', today.toISOString());

  // Get unique user IDs who made purchases/topups
  const userIds = creditsPrevDayData?.map((t) => t.user_id) || [];
  const uniqueUserIds = [...new Set(userIds)];

  // Get profile data for those users
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', uniqueUserIds);

  console.log('Credit transactions:', creditsPrevDayData?.length);
  console.log('Unique paying customers:', uniqueUserIds.length);
  console.log(
    'Customer usernames:',
    profilesData?.map((p) => p.username).join(', '),
  );

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

  const audioYesterdayCount = audioYesterday.count ?? 0;
  const audioPrevCount = audioPrev.count ?? 0;
  const audioWeekCount = audioWeek.count ?? 0;
  const cloneCount = clonePrevDay.count ?? 0;

  const profilesTodayCount = profilesPrevDay.count ?? 0;
  const profilesPrevCount = profilesPrev.count ?? 0;
  const profilesWeekCount = profilesWeek.count ?? 0;

  const creditsTodayCount = creditsPrevDay.count ?? 0;
  const creditsPrevCount = creditsPrev.count ?? 0;
  const creditsWeekCount = creditsWeek.count ?? 0;

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
    `Credit Transactions: ${creditsTodayCount} (${formatChange(creditsTodayCount, creditsPrevCount)}) 🤑`,
    `  - 7d total ${creditsWeekCount}, avg ${(creditsWeekCount / 7).toFixed(1)}`,
  ];
  // .join('\n');

  // await fetch(webhook, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ text: message }),
  // });

  return NextResponse.json({
    body: {
      title: `Daily stats for ${previousDay.toISOString().slice(0, 10)}`,
      audio_files: { info: message[1], total: message[2], cloned: message[3] },
      profiles: { info: message[4], total: message[5] },
      credit_transactions: { info: message[6], total: message[7] },
    },
  });
  // return NextResponse.json({ ok: true });
}
