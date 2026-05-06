'use client';

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
} from 'motion/react';
import {
  type FocusEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useState,
} from 'react';

interface SpotlightFieldProps {
  children: ReactNode;
}

const focusRingShadow =
  '0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--ring))';
const hoverRingShadow =
  '0 0 0 0 hsl(var(--background) / 0), 0 0 0 1px hsl(var(--primary) / 0.45)';
const idleRingShadow =
  '0 0 0 0 hsl(var(--background) / 0), 0 0 0 0 hsl(var(--ring) / 0)';

type SpotlightPointerEvent =
  | MouseEvent<HTMLDivElement>
  | PointerEvent<HTMLDivElement>;

export function SpotlightField({ children }: SpotlightFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [hasFocusedOnce, setHasFocusedOnce] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const spotlightX = useMotionValue(0);
  const spotlightY = useMotionValue(0);
  const spotlightBackground = useMotionTemplate`radial-gradient(260px circle at ${spotlightX}px ${spotlightY}px, hsl(var(--primary) / 0.38), transparent 70%)`;

  const handleMouseMove = useCallback(
    (event: SpotlightPointerEvent) => {
      const rect = event.currentTarget.getBoundingClientRect();

      setIsHovered(true);
      spotlightX.set(event.clientX - rect.left);
      spotlightY.set(event.clientY - rect.top);
    },
    [spotlightX, spotlightY],
  );

  const handleMouseEnter = useCallback(
    (event: SpotlightPointerEvent) => {
      setIsHovered(true);
      handleMouseMove(event);
    },
    [handleMouseMove],
  );

  const handleBlurCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextFocusedElement = event.relatedTarget;

    if (
      !(
        nextFocusedElement instanceof Node &&
        event.currentTarget.contains(nextFocusedElement)
      )
    ) {
      setIsFocused(false);
    }
  }, []);

  const canShowHoverSpotlight = isHovered && !hasFocusedOnce;

  let fieldRingShadow = idleRingShadow;

  if (canShowHoverSpotlight) {
    fieldRingShadow = hoverRingShadow;
  }

  if (isFocused) {
    fieldRingShadow = focusRingShadow;
  }

  return (
    <motion.div
      animate={shouldReduceMotion ? undefined : { boxShadow: fieldRingShadow }}
      className="relative overflow-hidden rounded-md border border-input bg-background"
      initial={false}
      onBlurCapture={handleBlurCapture}
      onFocusCapture={() => {
        setHasFocusedOnce(true);
        setIsFocused(true);
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovered(false)}
      onMouseMoveCapture={handleMouseMove}
      onPointerEnter={handleMouseEnter}
      onPointerLeave={() => setIsHovered(false)}
      onPointerMoveCapture={handleMouseMove}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
    >
      {!shouldReduceMotion && (
        <motion.div
          animate={{ opacity: canShowHoverSpotlight && !isFocused ? 1 : 0 }}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-md"
          initial={false}
          style={{ background: spotlightBackground }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        />
      )}
      <div className="relative">{children}</div>
    </motion.div>
  );
}
