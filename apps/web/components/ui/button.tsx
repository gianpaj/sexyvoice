import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';

import { cn } from '@/lib/utils';

// https://enhanced-button.vercel.app/
const buttonVariants = cva(
  'inline-flex active:scale-[0.96] items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2  disabled:bg-initial! disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow hover:bg-primary-active disabled:bg-primary',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 disabled:bg-destructive',
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground disabled:bg-background',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary-foreground/30 disabled:bg-secondary',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      effect: {
        expandIcon: 'group relative gap-0',
        ringHover:
          'transition-all duration-200 hover:ring-2 hover:ring-primary-active hover:ring-offset-2',
      },
      size: {
        default: 'h-10 px-4 py-2',
        xs: 'h-8 rounded-md px-2 text-xs',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

interface IconProps {
  icon: React.ElementType;
  iconPlacement: 'left' | 'right';
}

interface IconRefProps {
  icon?: never;
  iconPlacement?: undefined;
}

export type ButtonIconProps = (IconProps | IconRefProps) & React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }

function Button({
  className,
  variant,
  effect,
  size,
  icon: Icon,
  iconPlacement,
  asChild = false,
  ...props
}: ButtonIconProps) {
  const Comp = asChild ? Slot.Root : 'button';
  const buttonClassName = cn(
    buttonVariants({ variant, effect, size, className }),
  );

  return (
    <Comp
      className={buttonClassName}
      data-size={size}
      data-slot="button"
      data-variant={variant}
      {...props}
    >
      {Icon &&
        iconPlacement === 'left' &&
        (effect === 'expandIcon' ? (
          <div className="w-0 translate-x-[0%] pr-0 opacity-0 transition-all duration-200 group-hover:w-5 group-hover:translate-x-100 group-hover:pr-2 group-hover:opacity-100">
            <Icon />
          </div>
        ) : (
          <Icon />
        ))}
      <Slot.Slottable>{props.children}</Slot.Slottable>
      {Icon &&
        iconPlacement === 'right' &&
        (effect === 'expandIcon' ? (
          <div className="w-0 translate-x-full pl-0 opacity-0 transition-all duration-200 group-hover:w-5 group-hover:translate-x-0 group-hover:pl-2 group-hover:opacity-100">
            <Icon />
          </div>
        ) : (
          <Icon />
        ))}
    </Comp>
  );
}

export { Button, buttonVariants };
