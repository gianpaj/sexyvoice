'use client';

import { LazyMotion, m, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

const loadFeatures = () => import('./features').then((res) => res.domAnimation);

/** Fades, unblurs, and lifts its children into place the first time they scroll into view. */
export function FadeIn({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <LazyMotion features={loadFeatures}>
      <m.div
        initial={
          shouldReduceMotion
            ? false
            : { filter: 'blur(8px)', opacity: 0, y: 24 }
        }
        transition={{ delay, duration: 0.6, ease: 'easeOut' }}
        viewport={{ amount: 0.5, once: true }}
        whileInView={{ filter: 'blur(0px)', opacity: 1, y: 0 }}
      >
        {children}
      </m.div>
    </LazyMotion>
  );
}
