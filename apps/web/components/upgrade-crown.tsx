'use client';

import { Crown } from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Link } from '@/lib/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * Marks a paid-plan feature or limit. The tooltip explains it, and clicking
 * opens the credits page: touch screens never show the tooltip, so the link is
 * how phones reach the plans.
 */
export function UpgradeCrown({
  paid = false,
  tooltip,
}: {
  /** Already on a paid plan: the crown is muted. */
  paid?: boolean;
  tooltip: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <Link
            aria-label={tooltip}
            className="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
            href="/dashboard/credits"
          >
            <Crown
              aria-hidden="true"
              className={cn(
                'size-3.5',
                paid ? 'text-muted-foreground/50' : 'text-yellow-400',
              )}
            />
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
