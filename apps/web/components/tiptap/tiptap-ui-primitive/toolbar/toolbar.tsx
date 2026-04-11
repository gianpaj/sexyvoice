import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';

import { Separator } from '@/components/tiptap/tiptap-ui-primitive/separator';
import { useComposedRef } from '@/hooks/tiptap/use-composed-ref';
import { useMenuNavigation } from '@/hooks/tiptap/use-menu-navigation';
import { cn } from '@/lib/tiptap-utils';

type BaseProps = React.HTMLAttributes<HTMLDivElement>;

interface ToolbarProps extends BaseProps {
  variant?: 'floating' | 'fixed';
}

const useToolbarNavigation = (
  toolbarRef: React.RefObject<HTMLDivElement | null>,
) => {
  const [items, setItems] = useState<HTMLElement[]>([]);

  const collectItems = useCallback(() => {
    if (!toolbarRef.current) return [];
    return Array.from(
      toolbarRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [role="button"]:not([disabled]), [tabindex="0"]:not([disabled])',
      ),
    );
  }, [toolbarRef]);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const updateItems = () => setItems(collectItems());

    updateItems();
    const observer = new MutationObserver(updateItems);
    observer.observe(toolbar, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [collectItems, toolbarRef]);

  const { selectedIndex } = useMenuNavigation<HTMLElement>({
    containerRef: toolbarRef,
    items,
    orientation: 'horizontal',
    onSelect: (el) => el.click(),
    autoSelectFirstItem: false,
  });

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (toolbar.contains(target))
        target.setAttribute('data-focus-visible', 'true');
    };

    const handleBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (toolbar.contains(target))
        target.removeAttribute('data-focus-visible');
    };

    toolbar.addEventListener('focus', handleFocus, true);
    toolbar.addEventListener('blur', handleBlur, true);

    return () => {
      toolbar.removeEventListener('focus', handleFocus, true);
      toolbar.removeEventListener('blur', handleBlur, true);
    };
  }, [toolbarRef]);

  useEffect(() => {
    if (selectedIndex !== undefined && items[selectedIndex]) {
      items[selectedIndex].focus();
    }
  }, [selectedIndex, items]);
};

export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(
  ({ children, className, variant = 'fixed', ...props }, ref) => {
    const toolbarRef = useRef<HTMLDivElement>(null);
    const composedRef = useComposedRef(toolbarRef, ref);
    useToolbarNavigation(toolbarRef);

    const isFixed = variant === 'fixed';
    const isFloating = variant === 'floating';

    return (
      <div
        aria-label="toolbar"
        className={cn(
          'flex items-center gap-1',
          isFixed &&
            'scrollbar-hide sticky top-0 z-10 min-h-[2.75rem] w-full overflow-x-auto border-gray-100 border-b bg-white px-2 max-sm:fixed max-sm:top-auto max-sm:bottom-0 max-sm:border-t max-sm:border-b-0 max-sm:pb-safe dark:border-gray-900 dark:bg-black',
          isFloating &&
            'overflow-hidden rounded-xl border border-gray-200 bg-white p-1 shadow-lg max-sm:w-full max-sm:rounded-none max-sm:border-none max-sm:shadow-none dark:border-gray-800 dark:bg-black',
          className,
        )}
        data-variant={variant}
        ref={composedRef}
        role="toolbar"
        {...props}
      >
        {children}
      </div>
    );
  },
);
Toolbar.displayName = 'Toolbar';

export const ToolbarGroup = forwardRef<HTMLDivElement, BaseProps>(
  ({ children, className, ...props }, ref) => (
    <div
      className={cn('flex items-center gap-0.5 empty:hidden', className)}
      ref={ref}
      role="group"
      {...props}
    >
      {children}
    </div>
  ),
);
ToolbarGroup.displayName = 'ToolbarGroup';

export const ToolbarSeparator = forwardRef<HTMLDivElement, BaseProps>(
  ({ ...props }, ref) => (
    <Separator decorative orientation="vertical" ref={ref} {...props} />
  ),
);
ToolbarSeparator.displayName = 'ToolbarSeparator';
