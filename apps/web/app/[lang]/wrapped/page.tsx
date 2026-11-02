import type { Metadata } from 'next';

import { PlatformWrappedClient } from './wrapped.client';

export const metadata: Metadata = {
  description:
    'See the amazing stats from SexyVoice.ai in 2025. Total audio generated, voices used, and more!',
  title: 'SexyVoice.ai 2025 Wrapped - Platform Stats',
};

export default function PlatformWrappedPage() {
  return <PlatformWrappedClient />;
}
