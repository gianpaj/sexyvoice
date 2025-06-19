import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

export async function GET() {
  const webhook = process.env.TELEGRAM_WEBHOOK_URL;
  if (!webhook) {
    return NextResponse.json(
      { error: 'Missing TELEGRAM_WEBHOOK_URL' },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const now = new Date();
  const today = startOfDay(now);
  const yesterday = subtractDays(today, 1);
  const twoDaysAgo = subtractDays(today, 2);
  const sevenDaysAgo = subtractDays(today, 7);

  const audioToday = await supabase
    .from('audio_files')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString());
  const audioPrev = await supabase
    .from('audio_files')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', twoDaysAgo.toISOString())
    .lt('created_at', yesterday.toISOString());
  const audioWeek = await supabase
    .from('audio_files')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sevenDaysAgo.toISOString())
    .lt('created_at', today.toISOString());
  const cloneToday = await supabase
    .from('audio_files')
    .select('id', { count: 'exact', head: true })
    .eq('model', 'clone')
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString());
  const topVoices = await supabase
    .from('audio_files')
    .select('voice_id, voices(name), count:id')
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString())
    .group('voice_id, voices(name)')
    .order('count', { ascending: false })
    .limit(3);

  const profilesToday = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString());
  const profilesPrev = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', twoDaysAgo.toISOString())
    .lt('created_at', yesterday.toISOString());
  const profilesWeek = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sevenDaysAgo.toISOString())
    .lt('created_at', today.toISOString());

  const creditsToday = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['purchase', 'topup'])
    .gte('created_at', yesterday.toISOString())
    .lt('created_at', today.toISOString());
  const creditsPrev = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['purchase', 'topup'])
    .gte('created_at', twoDaysAgo.toISOString())
    .lt('created_at', yesterday.toISOString());
  const creditsWeek = await supabase
    .from('credit_transactions')
    .select('id', { count: 'exact', head: true })
    .in('type', ['purchase', 'topup'])
    .gte('created_at', sevenDaysAgo.toISOString())
    .lt('created_at', today.toISOString());

  const audioTodayCount = audioToday.count ?? 0;
  const audioPrevCount = audioPrev.count ?? 0;
  const audioWeekCount = audioWeek.count ?? 0;
  const cloneCount = cloneToday.count ?? 0;

  const profilesTodayCount = profilesToday.count ?? 0;
  const profilesPrevCount = profilesPrev.count ?? 0;
  const profilesWeekCount = profilesWeek.count ?? 0;

  const creditsTodayCount = creditsToday.count ?? 0;
  const creditsPrevCount = creditsPrev.count ?? 0;
  const creditsWeekCount = creditsWeek.count ?? 0;

  const topVoiceList =
    topVoices.data?.map((v) => `${v.voices.name} (${v.count})`).join(', ') ??
    'N/A';

  const message = [
    `Daily stats for ${yesterday.toISOString().slice(0, 10)}`,
    `Audio files: ${audioTodayCount} (${formatChange(audioTodayCount, audioPrevCount)})`,
    `  - 7d total ${audioWeekCount}, avg ${(audioWeekCount / 7).toFixed(1)}`,
    `  - Clone voices: ${cloneCount}`,
    `  - Top voices: ${topVoiceList}`,
    `Profiles: ${profilesTodayCount} (${formatChange(profilesTodayCount, profilesPrevCount)})`,
    `  - 7d total ${profilesWeekCount}, avg ${(profilesWeekCount / 7).toFixed(1)}`,
    `Transactions: ${creditsTodayCount} (${formatChange(creditsTodayCount, creditsPrevCount)})`,
    `  - 7d total ${creditsWeekCount}, avg ${(creditsWeekCount / 7).toFixed(1)}`,
  ].join('\n');

  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  });

  return NextResponse.json({ ok: true });
}
