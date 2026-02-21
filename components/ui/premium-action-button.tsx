'use client';

import { Sparkles } from 'lucide-react';
import * as React from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface PremiumActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether the current user has a paid account. */
  isPaidUser: boolean;
  /** Tooltip text shown when hovering over the button for free users. */
  premiumTooltip?: string;
  /** Extra class names applied to the outer wrapper. */
  wrapperClassName?: string;
}

/**
 * A general-purpose button that overlays a premium badge (Sparkles icon) and
 * disables interaction when the user is on a free plan.
 *
 * For paid users the button renders normally with no badge.
 *
 * Usage:
 * ```tsx
 * <PremiumActionButton isPaidUser={false} onClick={handleClick}>
 *   <Plus className="h-4 w-4" />
 * </PremiumActionButton>
 * ```
 */
const PremiumActionButton = React.forwardRef<
  HTMLButtonElement,
  PremiumActionButtonProps
>(
  (
    {
      isPaidUser,
      premiumTooltip = 'Upgrade to unlock',
      disabled,
      className,
      wrapperClassName,
      children,
      ...props
    },
    ref,
  ) => {
    const isDisabled = !isPaidUser || disabled;

    const button = (
      <div className={cn('relative inline-flex', wrapperClassName)}>
        <button
          ref={ref}
          className={cn(
            'inline-flex items-center justify-center transition-all',
            isDisabled && 'pointer-events-none opacity-50',
            className,
          )}
          disabled={isDisabled}
          type="button"
          {...props}
        >
          {children}
        </button>

        {/* Premium badge — only rendered for free users */}
        {!isPaidUser && (
          <span
            aria-label="Premium feature"
            className="pointer-events-none absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 shadow-sm"
          >
            <Sparkles className="h-2.5 w-2.5 text-white" />
          </span>
        )}
      </div>
    );

    // Wrap with a tooltip for free users so they know why it's disabled
    if (!isPaidUser) {
      return (
        <TooltipProvider>
          <Tooltip delayDuration={200} supportMobileTap>
            <TooltipTrigger asChild>
              {/* Wrap in a span so the tooltip still triggers on a disabled button */}
              <span className="inline-flex" tabIndex={0}>
                {button}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">{premiumTooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return button;
  },
);

PremiumActionButton.displayName = 'PremiumActionButton';

export { PremiumActionButton };
