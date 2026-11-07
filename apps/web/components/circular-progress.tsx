// https://github.com/shadcn-ui/ui/issues/697#issuecomment-2646770388

import type React from 'react';

import { cn } from '@/lib/utils';

interface ProgressCircleProps extends React.ComponentProps<'svg'> {
  className?: string;
  value: number;
}

// https://github.com/shadcn-ui/ui/issues/697
// https://github.com/shadcn-ui/ui/issues/697#issuecomment-2621653578 CircularProgress

function clamp(input: number, a: number, b: number): number {
  return Math.max(Math.min(input, Math.max(a, b)), Math.min(a, b));
}

// match values with lucide icons for compatibility
const size = 24;
const strokeWidth = 2;

// fix to percentage values
const total = 100;

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/progress
 * @see https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/progressbar_role
 */
export const ProgressCircle = ({
  value,
  className,
  ...restSvgProps
}: ProgressCircleProps) => {
  const normalizedValue = clamp(value, 0, total);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (normalizedValue / total) * circumference;
  const halfSize = size / 2;

  const commonParams = {
    cx: halfSize,
    cy: halfSize,
    r: radius,
    fill: 'none',
    strokeWidth,
  };

  return (
    <svg
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={normalizedValue}
      className={cn('size-6 fill-[#fff]', className)}
      role="progressbar"
      viewBox={`0 0 ${size} ${size}`}
      {...restSvgProps}
    >
      <circle {...commonParams} className="stroke-white/25" />
      <circle
        {...commonParams}
        className="stroke-current"
        stroke="currentColor"
        strokeDasharray={circumference}
        strokeDashoffset={circumference - progress}
        strokeLinecap="round"
        transform={`rotate(-90 ${halfSize} ${halfSize})`}
      />
      <text
        className="font-medium text-[0.4rem]"
        dominantBaseline="central"
        textAnchor="middle"
        x={halfSize}
        y={halfSize}
      >
        {Math.round(normalizedValue)}%
      </text>
    </svg>
  );
};
