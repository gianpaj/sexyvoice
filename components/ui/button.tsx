import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type * as React from 'react';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

// https://enhanced-button.vercel.app/
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow shadow hover:bg-primary-active',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary-foreground/30',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      effect: {
        expandIcon: 'group relative gap-0',
        ringHover:
          'transition-all duration-200 hover:ring-2 hover:ring-primary-active hover:ring-offset-2',
        gooeyRight:
          'relative z-0 overflow-hidden from-white/40 transition-all duration-500 before:absolute before:inset-0 before:-z-10 before:translate-x-[150%] before:translate-y-[150%] before:scale-[2.5] before:rounded-[100%] before:bg-linear-to-r before:transition-transform before:duration-1000 hover:before:translate-x-[0%] hover:before:translate-y-[0%]',
        gooeyLeft:
          'relative z-0 overflow-hidden from-white/40 transition-all duration-500 after:absolute after:inset-0 after:-z-10 after:translate-x-[-150%] after:translate-y-[150%] after:scale-[2.5] after:rounded-[100%] after:bg-linear-to-l after:transition-transform after:duration-1000 hover:after:translate-x-[0%] hover:after:translate-y-[0%]',
        underline:
          'no-underline! relative after:absolute after:bottom-2 after:h-px after:w-2/3 after:origin-bottom-left after:scale-x-100 after:bg-primary after:transition-transform after:duration-300 after:ease-in-out hover:after:origin-bottom-right hover:after:scale-x-0',
        hoverUnderline:
          'no-underline! relative after:absolute after:bottom-2 after:h-px after:w-2/3 after:origin-bottom-right after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 after:ease-in-out hover:after:origin-bottom-left hover:after:scale-x-100',
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

export type ButtonIconProps = IconProps | IconRefProps;

function Button({
  className,
  variant,
  effect,
  size,
  icon: Icon,
  iconPlacement,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  ButtonIconProps &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
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

const ButtonGroup = forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    orientation?: 'horizontal' | 'vertical';
  }
>(({ className, children, orientation = 'vertical', ...props }, ref) => {
  return (
    <div
      className={cn(
        'flex',
        orientation === 'vertical'
          ? 'min-w-max flex-col items-start [&>button]:w-full'
          : 'flex-row items-center gap-0.5',
        className,
      )}
      data-orientation={orientation}
      ref={ref}
      role="group"
      {...props}
    >
      {children}
    </div>
  );
});
ButtonGroup.displayName = 'ButtonGroup';

export { Button, ButtonGroup, buttonVariants };
