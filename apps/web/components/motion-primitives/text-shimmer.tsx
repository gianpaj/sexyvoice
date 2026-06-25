'use client';
import { LazyMotion, m } from 'motion/react';
import type React from 'react';

import { cn } from '@/lib/utils';

export interface TextShimmerProps {
  children: string;
  className?: string;
  duration?: number;
  spread?: number;
}

const loadFeatures = () => import('./features').then((res) => res.domAnimation);

export function TextShimmer({
  children,
  className,
  duration = 2,
  spread = 2,
}: TextShimmerProps) {
  const dynamicSpread = children.length * spread;

  return (
    <LazyMotion features={loadFeatures}>
      <m.p
        animate={{ backgroundPosition: '0% center' }}
        className={cn(
          'relative inline-block bg-size-[250%_100%,auto] bg-clip-text',
          'text-transparent [--base-color:#a1a1aa] [--base-gradient-color:#000]',
          '[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]',
          // 'dark:[--base-color:#71717a] dark:[--base-gradient-color:#ffffff] dark:[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--base-gradient-color),#0000_calc(50%+var(--spread)))]',
          className,
        )}
        initial={{ backgroundPosition: '100% center' }}
        style={
          {
            '--spread': `${dynamicSpread}px`,
            backgroundImage:
              'var(--bg), linear-gradient(var(--base-color), var(--base-color))',
          } as React.CSSProperties
        }
        transition={{
          repeat: Number.POSITIVE_INFINITY,
          duration,
          ease: 'linear',
        }}
      >
        {children}
      </m.p>
    </LazyMotion>
  );
}
