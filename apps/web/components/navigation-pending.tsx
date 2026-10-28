'use client';

import { cn } from '@/lib/utils';

// A top bar shown while a sidebar navigation renders the next page. It fades in
// after 100 ms, so navigations that finish sooner never show it.
export function NavigationPending({ pending }: { pending: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-primary opacity-0 transition-opacity',
        pending && 'opacity-100 delay-100',
      )}
      data-testid="navigation-pending"
    />
  );
}
