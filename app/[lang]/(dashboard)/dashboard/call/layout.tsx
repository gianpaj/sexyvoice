import type { Metadata } from 'next';

// import { NavLogo } from "@/components/custom/nav-logo";
// import { ThemeToggle } from "@/components/custom/theme-toggle";
import { RoomWrapper } from '@/components/call/room-wrapper';
import { TooltipProvider } from '@/components/ui/tooltip';
import { defaultPresets as baseDefaultPresets } from '@/data/presets';
import { ConnectionProvider } from '@/hooks/use-connection';
import { PlaygroundStateProvider } from '@/hooks/use-playground-state';
import {
  applyPresetInstructionOverrides,
  getCallInstructionConfig,
} from '@/lib/edge-config/call-instructions';
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
  const { defaultInstructions, initialInstruction, presetInstructions } =
    await getCallInstructionConfig();

  const defaultPresets = applyPresetInstructionOverrides(
    baseDefaultPresets,
    presetInstructions,
  );

  const { lang } = await params;

  const dict = await getDictionary(lang, 'call');

  return (
    // <PHProvider>
    <PlaygroundStateProvider
      defaultPresets={defaultPresets}
      initialState={{
        instructions: defaultInstructions,
        initialInstruction,
      }}
    >
      <ConnectionProvider dict={dict}>
        <TooltipProvider>
          <RoomWrapper>{children}</RoomWrapper>
        </TooltipProvider>
      </ConnectionProvider>
    </PlaygroundStateProvider>
  );
}
