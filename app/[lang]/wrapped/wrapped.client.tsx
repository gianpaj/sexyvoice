'use client';

import {
  Calendar,
  FileAudio,
  Flame,
  Sparkles,
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
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-20`}
      />
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
        isVisible
          ? 'translate-y-0 scale-100 opacity-100'
          : 'translate-y-8 scale-95 opacity-0'
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent" />
      <CardContent className="relative flex flex-col items-center justify-center p-8 text-center text-white md:p-12">
        <Sparkles className="mb-4 size-16 animate-pulse" />
        <h1 className="mb-2 font-bold text-4xl tracking-tight md:text-6xl">
          2025 Wrapped
        </h1>
        <p className="mb-2 text-xl opacity-90">SexyVoice.ai Platform Stats</p>
        <p className="mb-8 opacity-70">A year of expressive voices</p>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="font-bold text-3xl md:text-4xl">
              {formatNumber(stats.totalAudioFiles)}
            </div>
            <div className="text-sm opacity-80">Audio Files</div>
          </div>
          <div>
            <div className="font-bold text-3xl md:text-4xl">
              {formatNumber(stats.totalUsers)}
            </div>
            <div className="text-sm opacity-80">Users</div>
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
            <div className="flex items-center justify-between" key={voice.name}>
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-white/20 font-bold text-sm">
                  {index + 1}
                </span>
                <span className="font-medium">{voice.name}</span>
              </div>
              <span className="opacity-80">
                {formatNumber(voice.count)} uses
              </span>
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
            <div className="flex items-center gap-3" key={month.month}>
              <span className="w-16 text-xs opacity-80">{month.month}</span>
              <div className="h-4 flex-1 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white/60 transition-all duration-500"
                  style={{
                    width: `${maxAudio > 0 ? (month.audioCount / maxAudio) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="w-12 text-right text-xs">
                {formatNumber(month.audioCount)}
              </span>
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
            <Skeleton className="h-32 rounded-xl" key={i} />
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
    function fetchStats() {
      try {
        // const response = await fetch('/api/wrapped/platform');
        // if (!response.ok) {
        //   throw new Error('Failed to fetch platform stats');
        // }
        // const data = await response.json();

        const launchDate = new Date('2025-03-25');
        const daysSinceLaunch = Math.floor(
          (Date.now() - launchDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        const data = {
          totalAudioFiles: 38_763,
          totalDurationSeconds: 54_325.691_367_347_41,
          totalCharactersGenerated: 23_846_669,
          longestTextCharacters: 8206,
          averageTextLength: 615,
          totalUniqueVoicesUsed: 18,
          totalUsers: 11_167,
          totalPaidUsers: 185,
          totalVoiceClones: 2,
          totalClonedAudioFiles: 368,
          topVoices: [
            { name: 'zephyr', count: 14_999 },
            { name: 'tara', count: 6870 },
            { name: 'kore', count: 4867 },
            { name: 'sulafat', count: 2908 },
            { name: 'gacrux', count: 2391 },
          ],
          monthlyStats: [
            { month: 'Feb 2025', audioCount: 0, userCount: 5 },
            { month: 'Mar 2025', audioCount: 12, userCount: 10 },
            { month: 'Apr 2025', audioCount: 150, userCount: 39 },
            { month: 'May 2025', audioCount: 372, userCount: 205 },
            { month: 'Jun 2025', audioCount: 1182, userCount: 609 },
            { month: 'Jul 2025', audioCount: 4587, userCount: 1226 },
            { month: 'Aug 2025', audioCount: 3614, userCount: 936 },
            { month: 'Sep 2025', audioCount: 3625, userCount: 1099 },
            { month: 'Oct 2025', audioCount: 7062, userCount: 2000 },
            { month: 'Nov 2025', audioCount: 10_844, userCount: 2288 },
            { month: 'Dec 2025', audioCount: 7315, userCount: 2750 },
          ],
          platformLaunchDate: '2025-03-25',
          daysSinceLaunch,
        };
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
        <HeroCard isVisible={showContent} stats={stats} />

        {/* Featured Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <TopVoicesCard isVisible={showContent} stats={stats} />
          <MonthlyGrowthCard isVisible={showContent} stats={stats} />
        </div>

        {/* Core Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            delay={200}
            gradient="from-blue-500 to-cyan-500"
            icon={FileAudio}
            subtitle="Generated on the platform"
            title="Total Audio Files"
            value={formatNumber(stats.totalAudioFiles)}
          />
          <StatCard
            delay={400}
            gradient="from-amber-500 to-orange-500"
            icon={Users}
            subtitle="Creators on the platform"
            title="Total Users"
            value={formatNumber(stats.totalUsers)}
          />
          <StatCard
            delay={500}
            gradient="from-rose-500 to-red-500"
            icon={Type}
            subtitle="Total characters spoken"
            title="Characters Generated"
            value={formatNumber(stats.totalCharactersGenerated)}
          />
          <StatCard
            delay={700}
            gradient="from-fuchsia-500 to-pink-500"
            icon={Zap}
            subtitle="Generated with cloned voices"
            title="Cloned Audio Files"
            value={formatNumber(stats.totalClonedAudioFiles)}
          />
        </div>

        {/* Fun Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            delay={900}
            gradient="from-green-500 to-emerald-500"
            icon={Flame}
            subtitle="Characters in one generation"
            title="Longest Text"
            value={formatNumber(stats.longestTextCharacters)}
          />
          <StatCard
            delay={1000}
            gradient="from-violet-500 to-purple-500"
            icon={Type}
            subtitle="Characters per generation"
            title="Avg Text Length"
            value={formatNumber(stats.averageTextLength)}
          />
          <StatCard
            delay={1100}
            gradient="from-slate-500 to-gray-600"
            icon={Calendar}
            subtitle={`${stats.daysSinceLaunch} days ago`}
            title="Platform Launch"
            value={new Date(stats.platformLaunchDate).toLocaleDateString(
              'en-US',
              {
                month: 'short',
                year: 'numeric',
              },
            )}
          />
        </div>

        {/* CTA Section */}
        <Card
          className={`relative overflow-hidden border-0 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 transition-all duration-700 ${
            showContent
              ? 'translate-y-0 opacity-100'
              : 'translate-y-4 opacity-0'
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
              <Link href="/en/signup">Get Started Free</Link>
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
