import { forwardRef } from 'react';

import { cn } from '@/lib/tiptap-utils';

const Card = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        className={cn(
          'wrap-break-word relative flex min-w-0 flex-col rounded-lg border border-gray-800 bg-gray-950 bg-clip-border shadow-sm outline-none',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Card.displayName = 'Card';

const CardBody = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        className={cn('flex-auto overflow-y-auto p-1.5', className)}
        ref={ref}
        {...props}
      />
    );
  },
);
CardBody.displayName = 'CardBody';

const CardItemGroup = forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    orientation?: 'horizontal' | 'vertical';
  }
>(({ className, orientation = 'vertical', ...props }, ref) => {
  return (
    <div
      className={cn(
        'relative flex min-w-max align-middle',
        orientation === 'vertical'
          ? 'flex-col justify-center'
          : 'flex-row items-center gap-1',
        className,
      )}
      data-orientation={orientation}
      ref={ref}
      {...props}
    />
  );
});
CardItemGroup.displayName = 'CardItemGroup';

const CardGroupLabel = forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        className={cn(
          'pt-3 pr-2 pb-1 pl-2 font-semibold text-gray-200 text-xs capitalize leading-normal',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
CardGroupLabel.displayName = 'CardGroupLabel';

export { Card, CardBody, CardGroupLabel, CardItemGroup };
