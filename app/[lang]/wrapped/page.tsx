import type { Metadata } from 'next';

import { PlatformWrappedClient } from './wrapped.client';

export const metadata: Metadata = {
  title: 'SexyVoice.ai 2024 Wrapped - Platform Stats',
  description:
    'See the amazing stats from SexyVoice.ai in 2024. Total audio generated, voices used, and more!',
};

export default function PlatformWrappedPage() {
  return <PlatformWrappedClient />;
}
