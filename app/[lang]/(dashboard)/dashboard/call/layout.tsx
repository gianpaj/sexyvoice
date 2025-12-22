import type { Metadata } from 'next';

// import { NavLogo } from "@/components/custom/nav-logo";
// import { ThemeToggle } from "@/components/custom/theme-toggle";
import { RoomWrapper } from '@/components/call/room-wrapper';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ConnectionProvider } from '@/hooks/use-connection';
import { PlaygroundStateProvider } from '@/hooks/use-playground-state';

export const metadata: Metadata = {
  description: 'Real-time voice AI',
};

import '@livekit/components-styles';

export default function CallLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <PlaygroundStateProvider>
      <ConnectionProvider>
        <TooltipProvider>
          <RoomWrapper>{children}</RoomWrapper>
        </TooltipProvider>
      </ConnectionProvider>
    </PlaygroundStateProvider>
  );
}
