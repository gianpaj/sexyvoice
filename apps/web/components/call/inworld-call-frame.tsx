'use client';

import { type ReactNode, useLayoutEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

export function InworldCallFrame({
  children,
  className,
  fitKeyboard = false,
  testId,
}: {
  children: ReactNode;
  className?: string;
  fitKeyboard?: boolean;
  testId: string;
}) {
  const callView = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const view = callView.current;
    const viewport = window.visualViewport;
    if (!(fitKeyboard && view && viewport)) return;
    const fitAboveKeyboard = () => {
      const top = Math.max(
        viewport.offsetTop,
        view.getBoundingClientRect().top,
      );
      const height = Math.max(0, viewport.height + viewport.offsetTop - top);
      view.style.setProperty('--inworld-call-viewport', `${height}px`);
    };
    fitAboveKeyboard();
    viewport.addEventListener('resize', fitAboveKeyboard);
    viewport.addEventListener('scroll', fitAboveKeyboard);
    return () => {
      viewport.removeEventListener('resize', fitAboveKeyboard);
      viewport.removeEventListener('scroll', fitAboveKeyboard);
      view.style.removeProperty('--inworld-call-viewport');
    };
  }, [fitKeyboard]);
  return (
    <section
      className={cn(
        'mx-auto flex h-[calc(100dvh-7rem)] min-h-0 w-full max-w-md flex-col overflow-hidden rounded-3xl bg-[#060b22] text-slate-100',
        fitKeyboard && 'max-h-(--inworld-call-viewport)',
        className,
      )}
      data-testid={testId}
      ref={callView}
    >
      {children}
    </section>
  );
}
