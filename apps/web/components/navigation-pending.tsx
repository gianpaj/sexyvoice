'use client';

import { Loader2 } from 'lucide-react';
import { useLinkStatus } from 'next/link';

import { cn } from '@/lib/utils';

// Both indicators fade in after 100 ms, so navigations that finish sooner
// never show them.
const fadeIn = (pending: boolean) =>
  cn('opacity-0 transition-opacity', pending && 'opacity-100 delay-100');

// Confirms a sidebar click on desktop while the next dashboard page renders.
export function SidebarLinkPending() {
  const { pending } = useLinkStatus();

  return (
    <Loader2
      aria-hidden
      className={cn(
        'ml-auto size-4 shrink-0 group-data-[collapsible=icon]:hidden',
        fadeIn(pending),
        pending && 'animate-spin',
      )}
      data-testid="sidebar-link-pending"
    />
  );
}

// On phones the sidebar drawer closes and unmounts on click, taking
// `SidebarLinkPending` with it, so `DashboardUI` shows this bar instead.
export function MobileNavigationPending({ pending }: { pending: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 bg-primary',
        fadeIn(pending),
      )}
      data-testid="mobile-navigation-pending"
    />
  );
}
