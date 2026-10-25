'use client';

import { Loader2 } from 'lucide-react';
import { useLinkStatus } from 'next/link';

import { cn } from '@/lib/utils';

// Confirms a sidebar click while the next dashboard page renders. It fades in
// after 100 ms, so navigations that finish sooner never show it.
export function SidebarLinkPending() {
  const { pending } = useLinkStatus();

  return (
    <Loader2
      aria-hidden
      className={cn(
        'ml-auto size-4 shrink-0 opacity-0 transition-opacity group-data-[collapsible=icon]:hidden',
        pending && 'animate-spin opacity-100 delay-100',
      )}
      data-testid="sidebar-link-pending"
    />
  );
}
