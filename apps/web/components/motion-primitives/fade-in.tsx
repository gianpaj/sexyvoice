'use client';

import { LazyMotion, MotionConfig, m } from 'motion/react';
import type { ReactNode } from 'react';

const loadFeatures = () => import('./features').then((res) => res.domAnimation);

// The server HTML carries the hidden start state, so without JavaScript the
// content would never appear. This overrides those inline styles.
const NO_SCRIPT_STYLE =
  '[data-fade-in]{opacity:1!important;filter:none!important;transform:none!important}';

/**
 * Fades, unblurs, and lifts its children into place the first time they scroll
 * into view. Under reduced motion, `MotionConfig` drops the lift; the fade and
 * unblur still run.
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
        <noscript>
          <style>{NO_SCRIPT_STYLE}</style>
        </noscript>
        <m.div
          data-fade-in
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
