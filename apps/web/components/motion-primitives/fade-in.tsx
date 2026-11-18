'use client';

import { LazyMotion, MotionConfig, m } from 'motion/react';
import type { ReactNode } from 'react';

const loadFeatures = () => import('./features').then((res) => res.domAnimation);

/**
 * Fades, unblurs, and lifts its children into place the first time they scroll
 * into view. Under reduced motion, `MotionConfig` drops the lift and keeps the fade.
 */
export function FadeIn({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  return (
    <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user">
        <m.div
          initial={{ filter: 'blur(8px)', opacity: 0, y: 24 }}
          transition={{ delay, duration: 0.6, ease: 'easeOut' }}
          viewport={{ amount: 0.5, once: true }}
          whileInView={{ filter: 'blur(0px)', opacity: 1, y: 0 }}
        >
          {children}
        </m.div>
      </MotionConfig>
    </LazyMotion>
  );
}
