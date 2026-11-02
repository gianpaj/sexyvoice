import { cn } from '@/lib/utils';

function Skeleton({
  className,
  'aria-busy': ariaBusy = true,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      aria-busy={ariaBusy}
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-accent', className)}
      {...props}
    />
  );
}

export { Skeleton };
