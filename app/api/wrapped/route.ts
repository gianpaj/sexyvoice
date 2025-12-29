import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';

interface WrappedStats {
  // Core stats
  totalAudioFiles: number;
  totalDurationSeconds: number;
  totalCreditsUsed: number;
  totalCharactersGenerated: number;

  // Voice cloning stats
  totalVoiceClones: number;
  totalClonedAudioFiles: number;

  // Top voice
  topVoice: {
    name: string;
    count: number;
  } | null;

  // Time stats
  memberSince: string;
  daysSinceJoining: number;
  busiestMonth: {
    month: string;
    count: number;
  } | null;

  // Fun stats
  longestTextCharacters: number;
  averageTextLength: number;
  uniqueVoicesUsed: number;

  // Payment stats
  totalSpent: number;
  isPaidUser: boolean;
}

interface AudioFile {
  id: string;
  created_at: string | null;
  duration: number;
  credits_used: number;
  text_content: string;
  model: string;
  voice_id: string;
  voices: { name: string } | null;
}

interface CreditTransaction {
  type: string;
  amount: number;
  metadata: unknown;
  created_at: string;
}

const CLONE_MODELS = ['resemble-ai/chatterbox', 'resemble-ai/chatterbox-multilingual'];

function calculateTopVoice(audioFiles: AudioFile[]) {
  const voiceCounts = new Map<string, { name: string; count: number }>();
  for (const audio of audioFiles) {
    const voiceName = audio.voices?.name;
    if (voiceName && voiceName !== 'Cloned voice') {
      const existing = voiceCounts.get(voiceName);
      if (existing) {
        existing.count += 1;
      } else {
        voiceCounts.set(voiceName, { name: voiceName, count: 1 });
      }
    }
  }
  return voiceCounts.size > 0
    ? [...voiceCounts.values()].sort((a, b) => b.count - a.count)[0]
    : null;
}

function calculateBusiestMonth(audioFiles: AudioFile[]) {
  const monthCounts = new Map<string, number>();
  for (const audio of audioFiles) {
    if (audio.created_at) {
      const date = new Date(audio.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1);
    }
  }

  if (monthCounts.size === 0) return null;

  const sorted = [...monthCounts.entries()].sort(([, a], [, b]) => b - a);
  const [month, count] = sorted[0];
  const date = new Date(`${month}-01`);
  const monthName = date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  return { month: monthName, count };
}

function calculateCoreStats(audioFiles: AudioFile[]) {
  return {
    totalAudioFiles: audioFiles.length,
    totalDurationSeconds: audioFiles.reduce((sum, file) => sum + (file.duration || 0), 0),
    totalCreditsUsed: audioFiles.reduce((sum, file) => sum + (file.credits_used || 0), 0),
    totalCharactersGenerated: audioFiles.reduce((sum, file) => sum + (file.text_content?.length || 0), 0),
    longestTextCharacters: audioFiles.reduce((max, file) => Math.max(max, file.text_content?.length || 0), 0),
    uniqueVoicesUsed: new Set(audioFiles.map((f) => f.voice_id)).size,
  };
}

function calculatePaymentStats(creditTransactions: CreditTransaction[]) {
  const totalSpent = creditTransactions.reduce((sum, t) => {
    const metadata = t.metadata as { dollarAmount?: number } | null;
    return sum + (metadata?.dollarAmount ?? 0);
  }, 0);
  return {
    totalSpent,
    isPaidUser: creditTransactions.length > 0,
  };
}

export async function GET(_request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch all required data in parallel
    const [
      audioFilesResult,
      profileResult,
      voicesResult,
      creditTransactionsResult,
    ] = await Promise.all([
      supabase
        .from('audio_files')
        .select('id, created_at, duration, credits_used, text_content, model, voice_id, voices(name)')
        .eq('user_id', user.id)
        .is('deleted_at', null),
      supabase
        .from('profiles')
        .select('created_at')
        .eq('id', user.id)
        .single(),
      supabase
        .from('voices')
        .select('id, name, created_at')
        .eq('user_id', user.id)
        .eq('is_public', false),
      supabase
        .from('credit_transactions')
        .select('type, amount, metadata, created_at')
        .eq('user_id', user.id)
        .in('type', ['purchase', 'topup']),
    ]);

    if (audioFilesResult.error) throw audioFilesResult.error;
    if (profileResult.error) throw profileResult.error;
    if (voicesResult.error) throw voicesResult.error;
    if (creditTransactionsResult.error) throw creditTransactionsResult.error;

    const audioFiles = (audioFilesResult.data ?? []) as AudioFile[];
    const profile = profileResult.data;
    const userVoices = voicesResult.data ?? [];
    const creditTransactions = (creditTransactionsResult.data ?? []) as CreditTransaction[];

    // Calculate stats using helper functions
    const coreStats = calculateCoreStats(audioFiles);
    const topVoice = calculateTopVoice(audioFiles);
    const busiestMonth = calculateBusiestMonth(audioFiles);
    const paymentStats = calculatePaymentStats(creditTransactions);

    // Voice cloning stats
    const clonedAudioFiles = audioFiles.filter((file) => CLONE_MODELS.includes(file.model));

    // Time stats
    const memberSince = profile?.created_at ?? new Date().toISOString();
    const daysSinceJoining = Math.floor(
      (Date.now() - new Date(memberSince).getTime()) / (1000 * 60 * 60 * 24),
    );

    const stats: WrappedStats = {
      ...coreStats,
      totalVoiceClones: userVoices.length,
      totalClonedAudioFiles: clonedAudioFiles.length,
      topVoice,
      memberSince,
      daysSinceJoining,
      busiestMonth,
      averageTextLength: coreStats.totalAudioFiles > 0
        ? Math.round(coreStats.totalCharactersGenerated / coreStats.totalAudioFiles)
        : 0,
      ...paymentStats,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error fetching wrapped stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wrapped stats' },
      { status: 500 },
    );
  }
}
