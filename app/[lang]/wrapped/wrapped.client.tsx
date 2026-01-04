// 'use client';

import {
  Calendar,
  FileAudio,
  Flame,
  Mic2,
  TrendingUp,
  Trophy,
  Type,
  Users,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

import { HeaderStatic } from '@/components/header-static';
import { Button } from '@/components/ui/button';
import { getDictionary } from '@/lib/i18n/get-dictionary';

interface PlatformWrappedStats {
  totalAudioFiles: number;
  totalDurationSeconds: number;
  totalCharactersGenerated: number;
  totalUsers: number;
  totalPaidUsers: number;
  totalVoiceClones: number;
  totalClonedAudioFiles: number;
  totalRevenue: number;
  totalRefunds: number;
  netRevenue: number;
  topVoices: Array<{
    name: string;
    count: number;
  }>;
  monthlyStats: Array<{
    month: string;
    audioCount: number;
    userCount: number;
    revenue: number;
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

function formatCurrency(num: number): string {
  return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:border-primary/50 hover:bg-secondary">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-1 flex items-center gap-2 text-muted-foreground text-sm">
            <Icon className="size-4" />
            {title}
          </p>
          <div className="font-bold text-4xl text-foreground tracking-tight">
            {value}
          </div>
          {subtitle && (
            <p className="mt-2 text-muted-foreground text-xs">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="-right-4 -top-4 pointer-events-none absolute size-24 rounded-full bg-primary/5 transition-transform duration-500 group-hover:scale-150" />
    </div>
  );
}

function HeroSection({ stats }: { stats: PlatformWrappedStats }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-brand-purple/20 via-transparent to-brand-red/20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-chart-2/10 via-transparent to-transparent" />

      <div className="relative px-8 py-16 md:px-16 md:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 font-semibold text-primary text-sm">
            <Mic2 className="size-4" />
            Platform Year in Review
          </div>

          <h1 className="mb-4 font-bold text-5xl text-foreground tracking-tight md:text-7xl">
            2025 Wrapped
          </h1>

          <p className="mb-2 text-muted-foreground text-xl">SexyVoice.ai</p>
          <p className="mb-12 text-muted-foreground">
            A year of expressive voices
          </p>

          <div className="grid grid-cols-2 gap-8 md:gap-16">
            <div className="text-center">
              <div className="font-bold text-4xl text-foreground md:text-6xl">
                {formatNumber(stats.totalAudioFiles)}
              </div>
              <div className="mt-2 text-muted-foreground text-sm uppercase tracking-wider">
                Audio Files
              </div>
            </div>
            <div className="text-center">
              <div className="font-bold text-4xl text-foreground md:text-6xl">
                {formatNumber(stats.totalUsers)}
              </div>
              <div className="mt-2 text-muted-foreground text-sm uppercase tracking-wider">
                Users
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TopVoicesSection({ stats }: { stats: PlatformWrappedStats }) {
  if (stats.topVoices.length === 0) return null;

  const maxCount = Math.max(...stats.topVoices.map((v) => v.count));

  return (
    <section className="rounded-3xl border border-border bg-card p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-brand-purple/10">
          <Trophy className="size-5 text-brand-purple" />
        </div>
        <h2 className="font-semibold text-foreground text-xl">Top Voices</h2>
      </div>

      <div className="space-y-4">
        {stats.topVoices.map((voice, index) => (
          <div className="group" key={voice.name}>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-8 items-center justify-center rounded-lg font-bold text-sm ${
                    index === 0
                      ? 'bg-brand-purple/90 text-primary-foreground'
                      : 'bg-secondary text-foreground'
                  }`}
                >
                  {index + 1}
                </span>
                <span className="font-medium text-foreground capitalize">
                  {voice.name}
                </span>
              </div>
              <span className="text-muted-foreground text-sm">
                {formatNumber(voice.count)} uses
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-brand-purple/80 transition-all duration-700"
                style={{ width: `${(voice.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MonthlyGrowthSection({ stats }: { stats: PlatformWrappedStats }) {
  if (stats.monthlyStats.length === 0) return null;

  const maxAudio = Math.max(...stats.monthlyStats.map((m) => m.audioCount));

  return (
    <section className="rounded-3xl border border-border bg-card p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-chart-2/10">
          <TrendingUp className="size-5 text-chart-2/80" />
        </div>
        <h2 className="font-semibold text-foreground text-xl">
          Monthly Growth
        </h2>
      </div>

      <div className="space-y-3">
        {stats.monthlyStats.map((month) => (
          <div
            className="group flex items-center gap-1 md:gap-4"
            key={month.month}
          >
            <span className="w-18 shrink-0 text-muted-foreground text-xs">
              {month.month}
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-chart-2/70 transition-all duration-500"
                style={{
                  width: `${maxAudio > 0 ? (month.audioCount / maxAudio) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="w-12 text-right font-medium text-foreground text-xs">
              {formatNumber(month.audioCount)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-primary p-8 md:p-12">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-brand-purple via-transparent to-transparent" />

      <div className="relative text-center">
        <h2 className="mb-3 font-bold text-2xl text-primary-foreground md:text-3xl">
          Ready to create your own voice?
        </h2>
        <p className="mb-6 text-primary-foreground/80">
          Join thousands of creators using SexyVoice.ai
        </p>
        <Button
          asChild
          className="bg-background font-semibold text-foreground hover:bg-background/90"
          size="lg"
        >
          <Link href="/en/signup">Get Started Free</Link>
        </Button>
      </div>
    </section>
  );
}

const launchDate = new Date('2025-04-25');
const daysSinceLaunch = Math.floor(
  (Date.now() - launchDate.getTime()) / (1000 * 60 * 60 * 24),
);
const stats = {
  totalAudioFiles: 38_765,
  totalDurationSeconds: 54_323.691_367_347_41,
  totalCharactersGenerated: 23_848_157,
  longestTextCharacters: 8206,
  averageTextLength: 615,
  totalUniqueVoicesUsed: 18,
  totalUsers: 11_171,
  totalPaidUsers: 185,
  totalVoiceClones: 2,
  totalClonedAudioFiles: 368,
  totalRevenue: 4917,
  totalRefunds: 97.4,
  netRevenue: 4819.6,
  topVoices: [
    { name: 'zephyr', count: 14_999 },
    { name: 'tara', count: 6870 },
    { name: 'kore', count: 4867 },
    { name: 'sulafat', count: 2908 },
    { name: 'gacrux', count: 2391 },
  ],
  monthlyStats: [
    { month: 'Apr 2025', audioCount: 150, userCount: 39, revenue: 0 },
    { month: 'May 2025', audioCount: 372, userCount: 205, revenue: 0 },
    { month: 'Jun 2025', audioCount: 1182, userCount: 609, revenue: 5 },
    { month: 'Jul 2025', audioCount: 4587, userCount: 1226, revenue: 50 },
    { month: 'Aug 2025', audioCount: 3614, userCount: 936, revenue: 494 },
    { month: 'Sep 2025', audioCount: 3625, userCount: 1099, revenue: 399 },
    { month: 'Oct 2025', audioCount: 7062, userCount: 2000, revenue: 868 },
    { month: 'Nov 2025', audioCount: 10_844, userCount: 2288, revenue: 1584.6 },
    { month: 'Dec 2025', audioCount: 7317, userCount: 2754, revenue: 1419 },
  ],
  platformLaunchDate: '2025-04-25',
  daysSinceLaunch,
};

export async function PlatformWrappedClient() {
  const dictHeader = await getDictionary('en', 'header');

  return (
    <div className="min-h-screen bg-background">
      <HeaderStatic dict={dictHeader} lang="en" />
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-10 md:py-16">
        {/* Hero Section */}
        <HeroSection stats={stats} />

        {/* Featured Cards */}
        <div className="grid gap-6 md:grid-cols-2">
          <TopVoicesSection stats={stats} />
          <MonthlyGrowthSection stats={stats} />
        </div>

        {/* Core Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={FileAudio}
            subtitle="Generated on the platform"
            title="Total Audio Files"
            value={formatNumber(stats.totalAudioFiles)}
          />
          <StatCard
            icon={Users}
            subtitle="Creators on the platform"
            title="Total Users"
            value={formatNumber(stats.totalUsers)}
          />
          <StatCard
            icon={Type}
            subtitle="Total characters spoken"
            title="Characters Generated"
            value={formatNumber(stats.totalCharactersGenerated)}
          />
          <StatCard
            icon={Zap}
            subtitle="Generated with cloned voices"
            title="Cloned Audio Files"
            value={formatNumber(stats.totalClonedAudioFiles)}
          />
        </div>

        {/* Fun Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Flame}
            subtitle="Characters in one generation"
            title="Longest Text"
            value={formatNumber(stats.longestTextCharacters)}
          />
          <StatCard
            icon={Type}
            subtitle="Characters per generation"
            title="Avg Text Length"
            value={formatNumber(stats.averageTextLength)}
          />
          <StatCard
            icon={Users}
            subtitle="Customers who paid"
            title="Paid Users"
            value={formatNumber(stats.totalPaidUsers)}
          />
          <StatCard
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
        <CTASection />

        {/* Footer */}
        <footer className="pt-8 text-center">
          <p className="text-muted-foreground text-sm">
            SexyVoice.ai — Expressive Voices, Uncensored
          </p>
        </footer>
      </div>
    </div>
  );
}
