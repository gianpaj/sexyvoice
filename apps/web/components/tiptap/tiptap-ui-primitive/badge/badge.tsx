import { forwardRef } from 'react';

import { cn } from '@/lib/tiptap-utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  appearance?: 'default' | 'subdued' | 'emphasized';
  size?: 'default' | 'small' | 'large';
  trimText?: boolean;
  variant?:
    | 'ghost'
    | 'white'
    | 'gray'
    | 'green'
    | 'default'
    | 'yellow'
    | 'red'
    | 'brand';
}

const badgeVariants: Record<string, Record<string, string>> = {
  // Variant mapping (default, gray, etc) -> Appearance mapping (default, subdued, emphasized) -> Classes
  default: {
    default:
      'bg-white dark:bg-black border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-500',
    subdued:
      'bg-white dark:bg-black border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-400',
    emphasized:
      'bg-white dark:bg-black border-gray-600 dark:border-gray-500 text-gray-600 dark:text-gray-600',
  },
  ghost: {
    default:
      'bg-transparent border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-500',
    subdued:
      'bg-transparent border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-400',
    emphasized:
      'bg-transparent border-gray-600 dark:border-gray-500 text-gray-600 dark:text-gray-600',
  },
  gray: {
    default:
      'bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-500',
    subdued:
      'bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-400',
    emphasized:
      'bg-gray-700 dark:bg-gray-800 border-gray-500 dark:border-gray-500 text-white dark:text-black',
  },
  green: {
    default:
      'bg-green-100 dark:bg-green-900 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
    subdued:
      'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400',
    emphasized:
      'bg-green-600 dark:bg-green-500 border-green-600 dark:border-green-500 text-white',
  },
  yellow: {
    default:
      'bg-yellow-100 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300',
    subdued:
      'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400',
    emphasized:
      'bg-yellow-600 dark:bg-yellow-500 border-yellow-600 dark:border-yellow-500 text-white',
  },
  red: {
    default:
      'bg-red-100 dark:bg-red-900 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
    subdued:
      'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400',
    emphasized:
      'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500 text-white',
  },
  brand: {
    default:
      'bg-brand-100 dark:bg-brand-900 border-brand-300 dark:border-brand-700 text-brand-800 dark:text-brand-200',
    subdued:
      'bg-brand-50 dark:bg-brand-950 border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300',
    emphasized:
      'bg-brand-600 dark:bg-brand-400 border-brand-600 dark:border-brand-400 text-white dark:text-gray-950',
  },
};

const sizeClasses = {
  default:
    'h-5 min-w-[1.25rem] px-1 text-[0.625rem] rounded-md [&_svg]:w-2.5 [&_svg]:h-2.5',
  small:
    'h-4 min-w-[1rem] px-0.5 text-[0.5rem] rounded border [&_svg]:w-2 [&_svg]:h-2',
  large: 'h-6 min-w-[1.5rem] px-1.5 text-xs rounded-md [&_svg]:w-3 [&_svg]:h-3',
};

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  (
    {
      variant = 'default',
      size = 'default',
      appearance = 'default',
      trimText = false,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    // Resolve variant class
    const variantConfig = badgeVariants[variant] || badgeVariants.default;
    const appearanceClass = variantConfig[appearance] || variantConfig.default;

    // Resolve size class
    const sizeClass =
      sizeClasses[size as keyof typeof sizeClasses] || sizeClasses.default;

    return (
      <div
        className={cn(
          'inline-flex items-center justify-center border font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          appearanceClass,
          sizeClass,
          trimText && 'truncate',
          className,
        )}
        data-appearance={appearance}
        data-size={size}
        data-style={variant}
        ref={ref}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Badge.displayName = 'Badge';

export default Badge;
