import { createNavigation } from 'next-intl/navigation';

import { routing } from '@/src/i18n/routing';

// Lightweight wrappers around Next.js' navigation
// APIs that consider the routing configuration
export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
