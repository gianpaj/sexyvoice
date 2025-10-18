'use client';

import { NovuProvider } from '@novu/react';
import type { ReactNode } from 'react';

interface NovuProviderWrapperProps {
  children: ReactNode;
  subscriberId: string;
  applicationIdentifier: string;
}

export function NovuProviderWrapper({
  children,
  subscriberId,
  applicationIdentifier,
}: NovuProviderWrapperProps) {
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