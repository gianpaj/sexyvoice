'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

const hidden = { filter: 'blur(4px)', opacity: 0, scale: 0.25 };

/** Cross-fades between icons whenever `swapKey` changes. */
export function IconSwap({
  children,
  swapKey,
}: {
  children: ReactNode;
  swapKey: string;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence initial={false} mode="popLayout">
      <motion.span
        animate={{ filter: 'blur(0px)', opacity: 1, scale: 1 }}
        aria-hidden
        className="flex items-center justify-center"
        exit={shouldReduceMotion ? { opacity: 0 } : hidden}
        initial={shouldReduceMotion ? false : hidden}
        key={swapKey}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { bounce: 0, duration: 0.3, type: 'spring' }
        }
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
