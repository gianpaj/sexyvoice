'use client';

import { NovuProvider } from '@novu/react';
import type { ReactNode } from 'react';

interface NovuNotificationsProviderProps {
  children: ReactNode;
  subscriberId: string;
}

export function NovuNotificationsProvider({
  children,
  subscriberId,
}: NovuNotificationsProviderProps) {
  const applicationIdentifier =
    process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER;

  if (!applicationIdentifier) {
    return <>{children}</>;
  }

  return (
    <NovuProvider
      applicationIdentifier={applicationIdentifier}
      subscriberId={subscriberId}
    >
      {children}
    </NovuProvider>
  );
}
