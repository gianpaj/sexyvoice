'use client';

import { Fragment, forwardRef, useMemo } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/tiptap/tiptap-ui-primitive/tooltip';
import { cn, parseShortcutKeys } from '@/lib/tiptap-utils';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  shortcutKeys?: string;
  showTooltip?: boolean;
  size?: 'small' | 'medium' | 'large';
  tooltip?: React.ReactNode;
  variant?: 'primary' | 'ghost' | 'secondary';
}

const buttonVariants = {
  primary: 'bg-primary text-white hover:bg-primary-active',
  ghost: 'bg-transparent hover:bg-gray-800 text-gray-300 hover:text-white',
  secondary: 'bg-gray-800 text-gray-100 hover:bg-gray-700',
};

const buttonSizes = {
  small: 'h-6 px-1 text-xs rounded-md [&_svg]:h-3.5 [&_svg]:w-3.5',
  medium: 'h-8 px-2 text-sm rounded-lg [&_svg]:h-4 [&_svg]:w-4',
  large: 'h-10 px-2.5 text-base rounded-lg [&_svg]:h-5 [&_svg]:w-5',
};

export const ShortcutDisplay: React.FC<{ shortcuts: string[] }> = ({
  shortcuts,
}) => {
  if (shortcuts.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {shortcuts.map((key, index) => (
        <Fragment key={index}>
          {index > 0 && <span className="text-gray-400">+</span>}
          <kbd className="min-w-[1.5em] rounded border border-gray-200 bg-gray-100 px-1 py-0.5 text-center text-xs dark:border-gray-700 dark:bg-gray-800">
            {key}
          </kbd>
        </Fragment>
      ))}
    </div>
  );
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      tooltip,
      showTooltip = true,
      shortcutKeys,
      variant = 'secondary', // Default to secondary based on scss
      size = 'medium',
      'aria-label': ariaLabel,
      ...props
    },
    ref,
  ) => {
    const shortcuts = useMemo<string[]>(
      () => parseShortcutKeys({ shortcutKeys }),
      [shortcutKeys],
    );

    // Handle data-style and data-size props from legacy code if passed
    const finalVariant = (props as any)['data-style'] || variant;
    const finalSize = (props as any)['data-size'] || size;

    // Map legacy 'subdued' appearance or ghost style to ghost variant
    const isGhost =
      finalVariant === 'ghost' ||
      (props as any)['data-appearence'] === 'subdued';
    const computedVariantClass = isGhost
      ? buttonVariants.ghost
      : buttonVariants[finalVariant as keyof typeof buttonVariants] ||
        buttonVariants.secondary;

    const computedSizeClass =
      buttonSizes[finalSize as keyof typeof buttonSizes] || buttonSizes.medium;

    const buttonClass = cn(
      'inline-flex items-center justify-center gap-1 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50',
      computedVariantClass,
      computedSizeClass,
      className,
    );

    if (!(tooltip && showTooltip)) {
      return (
        <button
          aria-label={ariaLabel}
          className={buttonClass}
          ref={ref}
          {...props}
        >
          {children}
        </button>
      );
    }

    return (
      <Tooltip delay={200}>
        <TooltipTrigger
          aria-label={ariaLabel}
          className={buttonClass}
          ref={ref}
          {...props}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent className="flex flex-col items-center gap-1">
          <span>{tooltip}</span>
          <ShortcutDisplay shortcuts={shortcuts} />
        </TooltipContent>
      </Tooltip>
    );
  },
);

Button.displayName = 'Button';

export const ButtonGroup = forwardRef<
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

export default Button;
