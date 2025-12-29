'use client';

import {
  Calendar,
  Clock,
  Coins,
  FileAudio,
  Flame,
  Mic2,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Type,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface WrappedStats {
  totalAudioFiles: number;
  totalDurationSeconds: number;
  totalCreditsUsed: number;
  totalCharactersGenerated: number;
  totalVoiceClones: number;
  totalClonedAudioFiles: number;
  topVoice: {
    name: string;
    count: number;
  } | null;
  memberSince: string;
  daysSinceJoining: number;
  busiestMonth: {
    month: string;
    count: number;
  } | null;
  longestTextCharacters: number;
  averageTextLength: number;
  uniqueVoicesUsed: number;
  totalSpent: number;
  isPaidUser: boolean;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString();
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  gradient,
  delay,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  gradient: string;
  delay: number;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <Card
      className={`overflow-hidden border-0 transition-all duration-700 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-20`} />
      <CardHeader className="relative pb-2">
        <CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
          <Icon className="size-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="relative">
        <div className="font-bold text-3xl tracking-tight">{value}</div>
        {subtitle && (
          <p className="mt-1 text-muted-foreground text-xs">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function HeroCard({
  stats,
  isVisible,
}: {
  stats: WrappedStats;
  isVisible: boolean;
}) {
  return (
    <Card
      className={`relative overflow-hidden border-0 bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 transition-all duration-1000 ${
        isVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-8 scale-95 opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent" />
      <CardContent className="relative flex flex-col items-center justify-center p-8 text-center text-white">
        <Sparkles className="mb-4 size-12 animate-pulse" />
        <h1 className="mb-2 font-bold text-4xl tracking-tight md:text-5xl">
          Your 2024 Wrapped
        </h1>
        <p className="mb-6 text-lg opacity-90">SexyVoice.ai Year in Review</p>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <div>
            <div className="font-bold text-3xl">
              {formatNumber(stats.totalAudioFiles)}
            </div>
            <div className="text-sm opacity-80">Audio Files</div>
          </div>
          <div>
            <div className="font-bold text-3xl">
              {formatDuration(stats.totalDurationSeconds)}
            </div>
            <div className="text-sm opacity-80">Total Duration</div>
          </div>
          <div>
            <div className="font-bold text-3xl">
              {formatNumber(stats.totalCreditsUsed)}
            </div>
            <div className="text-sm opacity-80">Credits Used</div>
          </div>
          <div>
            <div className="font-bold text-3xl">{stats.daysSinceJoining}</div>
            <div className="text-sm opacity-80">Days as Member</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TopVoiceCard({
  stats,
  isVisible,
}: {
  stats: WrappedStats;
  isVisible: boolean;
}) {
  if (!stats.topVoice) return null;

  return (
    <Card
      className={`relative overflow-hidden border-0 bg-gradient-to-br from-amber-500 to-yellow-600 transition-all duration-700 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent" />
      <CardContent className="relative flex items-center gap-4 p-6 text-white">
        <div className="flex size-16 items-center justify-center rounded-full bg-white/20">
          <Trophy className="size-8" />
        </div>
        <div>
          <div className="font-medium text-sm opacity-80">Your #1 Voice</div>
          <div className="font-bold text-2xl">{stats.topVoice.name}</div>
          <div className="text-sm opacity-80">
            Used {stats.topVoice.count} times
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BusiestMonthCard({
  stats,
  isVisible,
}: {
  stats: WrappedStats;
  isVisible: boolean;
}) {
  if (!stats.busiestMonth) return null;

  return (
    <Card
      className={`relative overflow-hidden border-0 bg-gradient-to-br from-emerald-500 to-teal-600 transition-all duration-700 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent" />
      <CardContent className="relative flex items-center gap-4 p-6 text-white">
        <div className="flex size-16 items-center justify-center rounded-full bg-white/20">
          <Flame className="size-8" />
        </div>
        <div>
          <div className="font-medium text-sm opacity-80">Busiest Month</div>
          <div className="font-bold text-2xl">{stats.busiestMonth.month}</div>
          <div className="text-sm opacity-80">
            {stats.busiestMonth.count} audio files generated
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="container mx-auto space-y-6 pb-10">
      <Skeleton className="h-64 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="container mx-auto pb-10">
      <Card className="flex flex-col items-center justify-center p-12 text-center">
        <FileAudio className="mb-4 size-16 text-muted-foreground" />
        <h2 className="mb-2 font-bold text-2xl">No Stats Yet</h2>
        <p className="text-muted-foreground">
          Start generating audio files to see your wrapped stats!
        </p>
      </Card>
    </div>
  );
}

export function WrappedClient() {
  const [stats, setStats] = useState<WrappedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/wrapped');
        if (!response.ok) {
          throw new Error('Failed to fetch wrapped stats');
        }
        const data = await response.json();
        setStats(data);
        // Delay content reveal for animation
        setTimeout(() => setShowContent(true), 100);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (error) {
    return (
      <div className="container mx-auto pb-10">
        <Card className="p-6 text-center text-red-500">Error: {error}</Card>
      </div>
    );
  }
  if (!stats || stats.totalAudioFiles === 0) return <EmptyState />;

  return (
    <div className="container mx-auto space-y-6 pb-10">
      {/* Hero Section */}
      <HeroCard stats={stats} isVisible={showContent} />

      {/* Featured Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <TopVoiceCard stats={stats} isVisible={showContent} />
        <BusiestMonthCard stats={stats} isVisible={showContent} />
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Audio Files"
          value={formatNumber(stats.totalAudioFiles)}
          subtitle="Generated this year"
          icon={FileAudio}
          gradient="from-blue-500 to-cyan-500"
          delay={200}
        />
        <StatCard
          title="Total Duration"
          value={formatDuration(stats.totalDurationSeconds)}
          subtitle="Of audio generated"
          icon={Clock}
          gradient="from-purple-500 to-pink-500"
          delay={300}
        />
        <StatCard
          title="Credits Used"
          value={formatNumber(stats.totalCreditsUsed)}
          subtitle="Tokens consumed"
          icon={Coins}
          gradient="from-amber-500 to-orange-500"
          delay={400}
        />
        <StatCard
          title="Characters Generated"
          value={formatNumber(stats.totalCharactersGenerated)}
          subtitle="Total characters spoken"
          icon={Type}
          gradient="from-rose-500 to-red-500"
          delay={500}
        />
      </div>

      {/* Voice Cloning Section */}
      {(stats.totalVoiceClones > 0 || stats.totalClonedAudioFiles > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard
            title="Voice Clones Created"
            value={stats.totalVoiceClones}
            subtitle="Custom voices cloned"
            icon={Mic2}
            gradient="from-indigo-500 to-purple-500"
            delay={600}
          />
          <StatCard
            title="Cloned Audio Files"
            value={stats.totalClonedAudioFiles}
            subtitle="Using your cloned voices"
            icon={Zap}
            gradient="from-fuchsia-500 to-pink-500"
            delay={700}
          />
        </div>
      )}

      {/* Fun Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Unique Voices Used"
          value={stats.uniqueVoicesUsed}
          subtitle="Different voices explored"
          icon={Star}
          gradient="from-cyan-500 to-blue-500"
          delay={800}
        />
        <StatCard
          title="Longest Text"
          value={formatNumber(stats.longestTextCharacters)}
          subtitle="Characters in one generation"
          icon={TrendingUp}
          gradient="from-green-500 to-emerald-500"
          delay={900}
        />
        <StatCard
          title="Avg Text Length"
          value={formatNumber(stats.averageTextLength)}
          subtitle="Characters per generation"
          icon={Type}
          gradient="from-violet-500 to-purple-500"
          delay={1000}
        />
        <StatCard
          title="Member Since"
          value={new Date(stats.memberSince).toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          })}
          subtitle={`${stats.daysSinceJoining} days ago`}
          icon={Calendar}
          gradient="from-slate-500 to-gray-600"
          delay={1100}
        />
      </div>

      {/* Payment Stats (only for paid users) */}
      {stats.isPaidUser && (
        <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-green-500 to-emerald-600">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent" />
          <CardContent className="relative flex items-center justify-center gap-4 p-8 text-center text-white">
            <div>
              <div className="font-medium text-sm opacity-80">
                Total Investment in Your Voice
              </div>
              <div className="mt-2 font-bold text-4xl">
                ${stats.totalSpent.toFixed(2)}
              </div>
              <div className="mt-1 text-sm opacity-80">
                Thank you for your support!
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
