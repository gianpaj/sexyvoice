'use client';

import { useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface AltchaWidgetHandle {
  reset: () => void;
}

interface AltchaWidgetProps {
  challengeUrl: string;
  onExpired?: () => void;
  onVerified: (payload: string) => void;
  ref?: React.RefObject<AltchaWidgetHandle | null>;
}

export function AltchaWidget({
  challengeUrl,
  onVerified,
  onExpired,
  ref,
}: AltchaWidgetProps) {
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    reset() {
      const widget = containerRef.current?.querySelector('altcha-widget') as
        | (HTMLElement & { reset?: () => void })
        | null;
      widget?.reset?.();
    },
  }));

  useEffect(() => {
    import('altcha').then(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const widget = containerRef.current?.querySelector('altcha-widget') as
      | (HTMLElement & { value?: string })
      | null;
    if (!widget) return;

    function handleVerified(ev: Event) {
      const payload = (ev as CustomEvent<{ payload: string }>).detail?.payload;
      if (payload) {
        onVerified(payload);
      }
    }

    function handleStateChange(ev: Event) {
      const state = (ev as CustomEvent<{ state: string }>).detail?.state;
      if (state === 'expired') {
        onExpired?.();
      }
    }

    widget.addEventListener('verified', handleVerified);
    widget.addEventListener('statechange', handleStateChange);
    return () => {
      widget.removeEventListener('verified', handleVerified);
      widget.removeEventListener('statechange', handleStateChange);
    };
  }, [loaded, onVerified, onExpired]);

  return (
    <div ref={containerRef}>
      {loaded &&
        // biome-ignore lint/suspicious/noExplicitAny: altcha-widget is a custom element with no JSX types
        (() => {
          const AltchaEl = 'altcha-widget' as unknown as React.ElementType;
          return <AltchaEl challengeurl={challengeUrl} />;
        })()}
    </div>
  );
}
