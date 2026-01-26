import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type {
  UsageSourceType,
  MonthlyUsageSummary,
} from '@/lib/supabase/usage-queries';

// Color mapping for source types (matching columns.tsx)
const SOURCE_TYPE_COLORS: Record<UsageSourceType, string> = {
  tts: 'bg-purple-500',
  voice_cloning: 'bg-blue-500',
  live_call: 'bg-green-500',
  audio_processing: 'bg-orange-500',
};

interface SummaryCardProps {
  title: string;
  subtitle: string;
  totalCredits: number;
  totalCreditsLabel: string;
  totalOperations: number;
  totalOperationsLabel: string;
  bySourceType: MonthlyUsageSummary['bySourceType'];
  sourceTypeLabels: Record<UsageSourceType, string>;
}

export function SummaryCard({
  title,
  subtitle,
  totalCredits,
  totalCreditsLabel,
  totalOperations,
  totalOperationsLabel,
  bySourceType,
  sourceTypeLabels,
}: SummaryCardProps) {
  // Filter out source types with no usage
  const activeSourceTypes = (
    Object.entries(bySourceType) as [
      UsageSourceType,
      { credits: number; count: number },
    ][]
  ).filter(([, data]) => data.count > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Main stats */}
        <div className="mb-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-muted-foreground text-sm">{totalCreditsLabel}</p>
            <p className="font-bold text-2xl">
              {totalCredits.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">
              {totalOperationsLabel}
            </p>
            <p className="font-bold text-2xl">
              {totalOperations.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Breakdown by source type */}
        {activeSourceTypes.length > 0 && (
          <div className="space-y-2">
            {activeSourceTypes.map(([sourceType, data]) => (
              <div
                className="flex items-center justify-between"
                key={sourceType}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`size-3 rounded-full ${SOURCE_TYPE_COLORS[sourceType]}`}
                  />
                  <span className="text-sm">
                    {sourceTypeLabels[sourceType]}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-medium text-sm">
                    {data.credits.toLocaleString()}
                  </span>
                  <span className="ml-1 text-muted-foreground text-xs">
                    ({data.count})
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeSourceTypes.length === 0 && (
          <p className="text-center text-muted-foreground text-sm">
            No usage data
          </p>
        )}
      </CardContent>
    </Card>
  );
}
