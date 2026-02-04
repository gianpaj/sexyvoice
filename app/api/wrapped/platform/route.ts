import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';

interface CreditTransaction {
  id: string;
  created_at: string;
  metadata: {
    dollarAmount?: number;
  } | null;
}

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

  // Revenue stats
  totalRevenue: number;
  totalRefunds: number;
  netRevenue: number;

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
    revenue: number;
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

interface Profile {
  id: string;
  created_at: string | null;
}

const CLONE_MODELS = [
  'resemble-ai/chatterbox',
  'resemble-ai/chatterbox-multilingual',
];

// Platform launch date (you can adjust this)
const PLATFORM_LAUNCH_DATE = '2025-04-25';

const PAGE_SIZE = 1000;

/**
 * Fetches all audio files with pagination to handle Supabase's 1000 row limit
 */
async function fetchAllAudioFiles(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<AudioFile[]> {
  const allAudioFiles: AudioFile[] = [];
  let cursor: { created_at: string; id: string } | null = null;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('audio_files')
      .select(
        'id, created_at, duration, text_content, model, voice_id, voices(name)',
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);

    if (cursor) {
      query = query.or(
        `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`,
      );
    }

    const { data, error } = await query;

    if (error) throw error;

    if (data && data.length > 0) {
      allAudioFiles.push(...(data as AudioFile[]));
      hasMore = data.length === PAGE_SIZE;
      const last = data[data.length - 1];
      if (last.created_at) {
        cursor = { created_at: last.created_at, id: last.id };
      } else {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allAudioFiles;
}

/**
 * Fetches all profiles with pagination to handle Supabase's 1000 row limit
 */
async function fetchAllProfiles(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<Profile[]> {
  const allProfiles: Profile[] = [];
  let cursor: { created_at: string; id: string } | null = null;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('profiles')
      .select('id, created_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);

    if (cursor) {
      query = query.or(
        `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`,
      );
    }

    const { data, error } = await query;

    if (error) throw error;

    if (data && data.length > 0) {
      allProfiles.push(...data);
      hasMore = data.length === PAGE_SIZE;
      const last = data[data.length - 1];
      if (last.created_at) {
        cursor = { created_at: last.created_at, id: last.id };
      } else {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allProfiles;
}

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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Function iterates over multiple data sources separately for clarity
function calculateMonthlyStats(
  audioFiles: AudioFile[],
  profiles: Array<{ created_at: string | null }>,
  creditTransactions: CreditTransaction[],
) {
  const monthlyAudio = new Map<string, number>();
  const monthlyUsers = new Map<string, number>();
  const monthlyRevenue = new Map<string, number>();

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

  for (const transaction of creditTransactions) {
    if (transaction.created_at && transaction.metadata) {
      const { dollarAmount } = transaction.metadata;
      if (typeof dollarAmount === 'number') {
        const date = new Date(transaction.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyRevenue.set(
          monthKey,
          (monthlyRevenue.get(monthKey) ?? 0) + dollarAmount,
        );
      }
    }
  }

  // Get all unique months and sort them
  const allMonths = new Set([
    ...monthlyAudio.keys(),
    ...monthlyUsers.keys(),
    ...monthlyRevenue.keys(),
  ]);
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
      revenue: monthlyRevenue.get(monthKey) ?? 0,
    };
  });
}

function calculateCoreStats(audioFiles: AudioFile[]) {
  const totalAudioFiles = audioFiles.length;
  const totalDurationSeconds = audioFiles.reduce(
    (sum, file) => sum + (file.duration || 0),
    0,
  );
  const totalCharactersGenerated = audioFiles.reduce(
    (sum, file) => sum + (file.text_content?.length || 0),
    0,
  );
  const longestTextCharacters = audioFiles.reduce(
    (max, file) => Math.max(max, file.text_content?.length || 0),
    0,
  );
  const averageTextLength =
    totalAudioFiles > 0
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

function calculateRevenueStats(creditTransactions: CreditTransaction[]) {
  let totalRevenue = 0;
  let totalRefunds = 0;

  for (const transaction of creditTransactions) {
    if (transaction.metadata) {
      const { dollarAmount } = transaction.metadata;
      if (typeof dollarAmount === 'number') {
        if (dollarAmount < 0) {
          totalRefunds += Math.abs(dollarAmount);
        } else {
          totalRevenue += dollarAmount;
        }
      }
    }
  }

  return {
    totalRevenue,
    totalRefunds,
    netRevenue: totalRevenue - totalRefunds,
  };
}

export async function GET() {
  try {
    const isProd = process.env.NODE_ENV === 'production';

    if (isProd) {
      return new NextResponse('Unauthorized', {
        status: 401,
      });
    }

    const supabase = createAdminClient();

    // Fetch data - paginated queries run separately, others in parallel
    const [
      audioFiles,
      profiles,
      voicesResult,
      paidUsersResult,
      creditTransactionsResult,
    ] = await Promise.all([
      // All audio files with voice info (paginated)
      fetchAllAudioFiles(supabase),
      // All profiles (paginated)
      fetchAllProfiles(supabase),
      // All cloned voices (non-public) - unlikely to exceed 1000
      supabase
        .from('voices')
        .select('id')
        .eq('is_public', false),
      // Users with payment transactions
      supabase
        .from('credit_transactions')
        .select('user_id')
        .in('type', ['purchase', 'topup']),
      // All credit transactions for revenue calculation
      supabase
        .from('credit_transactions')
        .select('id, created_at, metadata')
        .in('type', ['purchase', 'topup', 'refund']),
    ]);

    if (voicesResult.error) throw voicesResult.error;
    if (paidUsersResult.error) throw paidUsersResult.error;
    if (creditTransactionsResult.error) throw creditTransactionsResult.error;

    const userVoices = voicesResult.data ?? [];
    const paidTransactions = paidUsersResult.data ?? [];
    const creditTransactions = (creditTransactionsResult.data ??
      []) as CreditTransaction[];

    // Calculate stats
    const coreStats = calculateCoreStats(audioFiles);
    const topVoices = calculateTopVoices(audioFiles);
    const revenueStats = calculateRevenueStats(creditTransactions);
    const monthlyStats = calculateMonthlyStats(
      audioFiles,
      profiles,
      creditTransactions,
    );

    // Voice cloning stats
    const clonedAudioFiles = audioFiles.filter((file) =>
      CLONE_MODELS.includes(file.model),
    );

    // Unique paid users
    const uniquePaidUsers = new Set(paidTransactions.map((t) => t.user_id))
      .size;

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
      ...revenueStats,
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
