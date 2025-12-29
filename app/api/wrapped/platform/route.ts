import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

interface PlatformWrappedStats {
  // Core stats
  totalAudioFiles: number;
  totalDurationSeconds: number;
  totalCharactersGenerated: number;

  // User stats
  totalUsers: number;
  totalPaidUsers: number;

  // Voice stats
  totalVoiceClones: number;
  totalClonedAudioFiles: number;

  // Top voices
  topVoices: Array<{
    name: string;
    count: number;
  }>;

  // Monthly activity
  monthlyStats: Array<{
    month: string;
    audioCount: number;
    userCount: number;
  }>;

  // Fun stats
  longestTextCharacters: number;
  averageTextLength: number;
  totalUniqueVoicesUsed: number;

  // Platform age
  platformLaunchDate: string;
  daysSinceLaunch: number;
}

interface AudioFile {
  id: string;
  created_at: string | null;
  duration: number;
  text_content: string;
  model: string;
  voice_id: string;
  voices: { name: string } | null;
}

const CLONE_MODELS = ['resemble-ai/chatterbox', 'resemble-ai/chatterbox-multilingual'];

// Platform launch date (you can adjust this)
const PLATFORM_LAUNCH_DATE = '2024-01-01';

function calculateTopVoices(audioFiles: AudioFile[], limit = 5) {
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
  return [...voiceCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function calculateMonthlyStats(
  audioFiles: AudioFile[],
  profiles: Array<{ created_at: string | null }>,
) {
  const monthlyAudio = new Map<string, number>();
  const monthlyUsers = new Map<string, number>();

  for (const audio of audioFiles) {
    if (audio.created_at) {
      const date = new Date(audio.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyAudio.set(monthKey, (monthlyAudio.get(monthKey) ?? 0) + 1);
    }
  }

  for (const profile of profiles) {
    if (profile.created_at) {
      const date = new Date(profile.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlyUsers.set(monthKey, (monthlyUsers.get(monthKey) ?? 0) + 1);
    }
  }

  // Get all unique months and sort them
  const allMonths = new Set([...monthlyAudio.keys(), ...monthlyUsers.keys()]);
  const sortedMonths = [...allMonths].sort();

  // Take last 12 months
  const last12Months = sortedMonths.slice(-12);

  return last12Months.map((monthKey) => {
    const date = new Date(`${monthKey}-01`);
    const monthName = date.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
    return {
      month: monthName,
      audioCount: monthlyAudio.get(monthKey) ?? 0,
      userCount: monthlyUsers.get(monthKey) ?? 0,
    };
  });
}

function calculateCoreStats(audioFiles: AudioFile[]) {
  const totalAudioFiles = audioFiles.length;
  const totalDurationSeconds = audioFiles.reduce((sum, file) => sum + (file.duration || 0), 0);
  const totalCharactersGenerated = audioFiles.reduce(
    (sum, file) => sum + (file.text_content?.length || 0),
    0,
  );
  const longestTextCharacters = audioFiles.reduce(
    (max, file) => Math.max(max, file.text_content?.length || 0),
    0,
  );
  const averageTextLength = totalAudioFiles > 0
    ? Math.round(totalCharactersGenerated / totalAudioFiles)
    : 0;
  const totalUniqueVoicesUsed = new Set(audioFiles.map((f) => f.voice_id)).size;

  return {
    totalAudioFiles,
    totalDurationSeconds,
    totalCharactersGenerated,
    longestTextCharacters,
    averageTextLength,
    totalUniqueVoicesUsed,
  };
}

export async function GET() {
  try {
    const supabase = createAdminClient();

    // Fetch all required data in parallel
    const [
      audioFilesResult,
      profilesResult,
      voicesResult,
      paidUsersResult,
    ] = await Promise.all([
      // All audio files with voice info
      supabase
        .from('audio_files')
        .select('id, created_at, duration, text_content, model, voice_id, voices(name)')
        .is('deleted_at', null),
      // All profiles
      supabase
        .from('profiles')
        .select('id, created_at'),
      // All cloned voices (non-public)
      supabase
        .from('voices')
        .select('id')
        .eq('is_public', false),
      // Users with payment transactions
      supabase
        .from('credit_transactions')
        .select('user_id')
        .in('type', ['purchase', 'topup']),
    ]);

    if (audioFilesResult.error) throw audioFilesResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (voicesResult.error) throw voicesResult.error;
    if (paidUsersResult.error) throw paidUsersResult.error;

    const audioFiles = (audioFilesResult.data ?? []) as AudioFile[];
    const profiles = profilesResult.data ?? [];
    const userVoices = voicesResult.data ?? [];
    const paidTransactions = paidUsersResult.data ?? [];

    // Calculate stats
    const coreStats = calculateCoreStats(audioFiles);
    const topVoices = calculateTopVoices(audioFiles);
    const monthlyStats = calculateMonthlyStats(audioFiles, profiles);

    // Voice cloning stats
    const clonedAudioFiles = audioFiles.filter((file) => CLONE_MODELS.includes(file.model));

    // Unique paid users
    const uniquePaidUsers = new Set(paidTransactions.map((t) => t.user_id)).size;

    // Platform age
    const launchDate = new Date(PLATFORM_LAUNCH_DATE);
    const daysSinceLaunch = Math.floor(
      (Date.now() - launchDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    const stats: PlatformWrappedStats = {
      ...coreStats,
      totalUsers: profiles.length,
      totalPaidUsers: uniquePaidUsers,
      totalVoiceClones: userVoices.length,
      totalClonedAudioFiles: clonedAudioFiles.length,
      topVoices,
      monthlyStats,
      platformLaunchDate: PLATFORM_LAUNCH_DATE,
      daysSinceLaunch,
    };

    // Cache for 5 minutes
    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Error fetching platform wrapped stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch platform stats' },
      { status: 500 },
    );
  }
}
