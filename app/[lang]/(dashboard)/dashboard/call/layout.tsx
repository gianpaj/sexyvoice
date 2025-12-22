import type { Metadata } from 'next';

// import { NavLogo } from "@/components/custom/nav-logo";
// import { ThemeToggle } from "@/components/custom/theme-toggle";
import { RoomWrapper } from '@/components/call/room-wrapper';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConnectionProvider } from '@/hooks/use-connection';
import { PlaygroundStateProvider } from '@/hooks/use-playground-state';
import { getDictionary } from '@/lib/i18n/get-dictionary';
import type { Locale } from '@/lib/i18n/i18n-config';

import '@livekit/components-styles';

export const metadata: Metadata = {
  description: 'Real-time voice AI',
};

export default async function CallLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>;
}>) {
  const { lang } = await params;

  const dict = await getDictionary(lang, 'call');

  return (
    <PlaygroundStateProvider>
      <ConnectionProvider dict={dict}>
        <TooltipProvider>
          <RoomWrapper>{children}</RoomWrapper>
        </TooltipProvider>
      </ConnectionProvider>
    </PlaygroundStateProvider>
  );
}
