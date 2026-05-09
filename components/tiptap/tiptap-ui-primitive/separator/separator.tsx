import { forwardRef } from 'react';

import { cn } from '@/lib/tiptap-utils';

export type Orientation = 'horizontal' | 'vertical';

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  decorative?: boolean;
  orientation?: Orientation;
}

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(
  ({ decorative, orientation = 'vertical', className, ...divProps }, ref) => {
    const ariaOrientation =
      orientation === 'vertical' ? orientation : undefined;
    const semanticProps = decorative
      ? { role: 'none' }
      : { 'aria-orientation': ariaOrientation, role: 'separator' };

    return (
      <div
        className={cn(
          'shrink-0 bg-gray-200 dark:bg-gray-800',
          orientation === 'horizontal' ? 'my-2 h-px w-full' : 'h-6 w-px',
          className,
        )}
        data-orientation={orientation}
        {...semanticProps}
        {...divProps}
        ref={ref}
      />
    );
  },
);

Separator.displayName = 'Separator';
