import type { Metadata } from 'next';

import '@livekit/components-styles';

export const metadata: Metadata = {
  description: 'Real-time voice AI',
};

export default function CallLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
