import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Route-level loading UI for dashboard pages. Each page's `loading.tsx`
// renders it so sidebar links can prefetch it and switch pages immediately.
export function DashboardPageSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('mx-auto space-y-8', className)}
      data-testid="dashboard-page-skeleton"
    >
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
