'use client';

import { useSyncExternalStore } from 'react';
import 'altcha';

interface AltchaWidgetProps {
  challengeUrl: string;
  ref?: React.RefObject<HTMLElement | null>;
}

export function AltchaWidget({ challengeUrl, ref }: AltchaWidgetProps) {
  // biome-ignore lint/suspicious/noEmptyBlockStatements: noop unsubscribe required by useSyncExternalStore
  // biome-ignore lint/complexity/noUselessEmptyExport: <explanation>
  const isClient = useSyncExternalStore(
    // biome-ignore lint/suspicious/noEmptyBlockStatements: noop unsubscribe
    () => () => {
      /* noop */
    },
    () => true,
    () => false,
  );

  if (!isClient) {
    return <span className="inline-block h-8" />;
  }

  // altcha-widget is a custom element — biome-ignore required for web component JSX casting
  // biome-ignore lint/suspicious/noExplicitAny: web component has no JSX types
  const AltchaEl = 'altcha-widget' as unknown as React.ElementType;

  return <AltchaEl challengeurl={challengeUrl} ref={ref} />;
}
