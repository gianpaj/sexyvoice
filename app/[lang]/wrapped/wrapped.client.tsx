'use client';

import {
  Calendar,
  Clock,
  FileAudio,
  Flame,
  Mic2,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Type,
  Users,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface PlatformWrappedStats {
  totalAudioFiles: number;
  totalDurationSeconds: number;
  totalCharactersGenerated: number;
  totalUsers: number;
  totalPaidUsers: number;
  totalVoiceClones: number;
  totalClonedAudioFiles: number;
  topVoices: Array<{
    name: string;
    count: number;
  }>;
  monthlyStats: Array<{
    month: string;
    audioCount: number;
    userCount: number;
  }>;
  longestTextCharacters: number;
  averageTextLength: number;
  totalUniqueVoicesUsed: number;
  platformLaunchDate: string;
  daysSinceLaunch: number;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours < 24) return `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
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
  stats: PlatformWrappedStats;
  isVisible: boolean;
}) {
  return (
    <Card
      className={`relative overflow-hidden border-0 bg-gradient-to-br from-violet-600 via-purple-500 to-fuchsia-500 transition-all duration-1000 ${
        isVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-8 scale-95 opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent" />
      <CardContent className="relative flex flex-col items-center justify-center p-8 text-center text-white md:p-12">
        <Sparkles className="mb-4 size-16 animate-pulse" />
        <h1 className="mb-2 font-bold text-4xl tracking-tight md:text-6xl">
          2024 Wrapped
        </h1>
        <p className="mb-2 text-xl opacity-90">SexyVoice.ai Platform Stats</p>
        <p className="mb-8 opacity-70">A year of expressive voices</p>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <div>
            <div className="font-bold text-3xl md:text-4xl">
              {formatNumber(stats.totalAudioFiles)}
            </div>
            <div className="text-sm opacity-80">Audio Files</div>
          </div>
          <div>
            <div className="font-bold text-3xl md:text-4xl">
              {formatDuration(stats.totalDurationSeconds)}
            </div>
            <div className="text-sm opacity-80">Total Duration</div>
          </div>
          <div>
            <div className="font-bold text-3xl md:text-4xl">
              {formatNumber(stats.totalUsers)}
            </div>
            <div className="text-sm opacity-80">Users</div>
          </div>
          <div>
            <div className="font-bold text-3xl md:text-4xl">
              {stats.daysSinceLaunch}
            </div>
            <div className="text-sm opacity-80">Days Live</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TopVoicesCard({
  stats,
  isVisible,
}: {
  stats: PlatformWrappedStats;
  isVisible: boolean;
}) {
  if (stats.topVoices.length === 0) return null;

  return (
    <Card
      className={`relative overflow-hidden border-0 bg-gradient-to-br from-amber-500 to-orange-600 transition-all duration-700 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent" />
      <CardContent className="relative p-6 text-white">
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="size-6" />
          <h3 className="font-bold text-lg">Top Voices</h3>
        </div>
        <div className="space-y-3">
          {stats.topVoices.map((voice, index) => (
            <div key={voice.name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-white/20 font-bold text-sm">
                  {index + 1}
                </span>
                <span className="font-medium">{voice.name}</span>
              </div>
              <span className="opacity-80">{formatNumber(voice.count)} uses</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MonthlyGrowthCard({
  stats,
  isVisible,
}: {
  stats: PlatformWrappedStats;
  isVisible: boolean;
}) {
  if (stats.monthlyStats.length === 0) return null;

  const maxAudio = Math.max(...stats.monthlyStats.map((m) => m.audioCount));

  return (
    <Card
      className={`relative overflow-hidden border-0 bg-gradient-to-br from-emerald-500 to-teal-600 transition-all duration-700 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent" />
      <CardContent className="relative p-6 text-white">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="size-6" />
          <h3 className="font-bold text-lg">Monthly Growth</h3>
        </div>
        <div className="space-y-2">
          {stats.monthlyStats.slice(-6).map((month) => (
            <div key={month.month} className="flex items-center gap-3">
              <span className="w-16 text-xs opacity-80">{month.month}</span>
              <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white/60 transition-all duration-500"
                  style={{
                    width: `${maxAudio > 0 ? (month.audioCount / maxAudio) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="w-12 text-right text-xs">{formatNumber(month.audioCount)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto space-y-6 px-4 py-10">
        <Skeleton className="h-80 w-full rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="p-6 text-center text-red-500">Error: {error}</Card>
    </div>
  );
}

export function PlatformWrappedClient() {
  const [stats, setStats] = useState<PlatformWrappedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/wrapped/platform');
        if (!response.ok) {
          throw new Error('Failed to fetch platform stats');
        }
        const data = await response.json();
        setStats(data);
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
  if (error) return <ErrorState error={error} />;
  if (!stats) return <ErrorState error="No stats available" />;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto space-y-6 px-4 py-10">
        {/* Hero Section */}
        <HeroCard stats={stats} isVisible={showContent} />

        {/* Featured Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <TopVoicesCard stats={stats} isVisible={showContent} />
          <MonthlyGrowthCard stats={stats} isVisible={showContent} />
        </div>

        {/* Core Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Audio Files"
            value={formatNumber(stats.totalAudioFiles)}
            subtitle="Generated on the platform"
            icon={FileAudio}
            gradient="from-blue-500 to-cyan-500"
            delay={200}
          />
          <StatCard
            title="Total Duration"
            value={formatDuration(stats.totalDurationSeconds)}
            subtitle="Of audio created"
            icon={Clock}
            gradient="from-purple-500 to-pink-500"
            delay={300}
          />
          <StatCard
            title="Total Users"
            value={formatNumber(stats.totalUsers)}
            subtitle="Creators on the platform"
            icon={Users}
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
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard
            title="Voice Clones Created"
            value={formatNumber(stats.totalVoiceClones)}
            subtitle="Custom voices by users"
            icon={Mic2}
            gradient="from-indigo-500 to-purple-500"
            delay={600}
          />
          <StatCard
            title="Cloned Audio Files"
            value={formatNumber(stats.totalClonedAudioFiles)}
            subtitle="Generated with cloned voices"
            icon={Zap}
            gradient="from-fuchsia-500 to-pink-500"
            delay={700}
          />
        </div>

        {/* Fun Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Unique Voices Used"
            value={stats.totalUniqueVoicesUsed}
            subtitle="Different voices explored"
            icon={Star}
            gradient="from-cyan-500 to-blue-500"
            delay={800}
          />
          <StatCard
            title="Longest Text"
            value={formatNumber(stats.longestTextCharacters)}
            subtitle="Characters in one generation"
            icon={Flame}
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
            title="Platform Launch"
            value={new Date(stats.platformLaunchDate).toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric',
            })}
            subtitle={`${stats.daysSinceLaunch} days ago`}
            icon={Calendar}
            gradient="from-slate-500 to-gray-600"
            delay={1100}
          />
        </div>

        {/* CTA Section */}
        <Card
          className={`relative overflow-hidden border-0 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 transition-all duration-700 ${
            showContent ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent" />
          <CardContent className="relative flex flex-col items-center justify-center gap-4 p-8 text-center text-white md:p-12">
            <h2 className="font-bold text-2xl md:text-3xl">
              Ready to create your own voice?
            </h2>
            <p className="opacity-80">
              Join thousands of creators using SexyVoice.ai
            </p>
            <Button
              asChild
              className="mt-2 bg-white font-semibold text-purple-600 hover:bg-white/90"
              size="lg"
            >
              <Link href="/signup">Get Started Free</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="pt-8 text-center text-muted-foreground text-sm">
          <p>SexyVoice.ai - Expressive Voices, Uncensored</p>
        </div>
      </div>
    </div>
  );
}
