'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { forwardRef } from 'react';

import { cn } from '@/lib/tiptap-utils';

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root modal={false} {...props} />;
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal {...props} />;
}

const DropdownMenuTrigger = forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger>
>(({ ...props }, ref) => (
  <DropdownMenuPrimitive.Trigger ref={ref} {...props} />
));
DropdownMenuTrigger.displayName = DropdownMenuPrimitive.Trigger.displayName;

const DropdownMenuGroup = DropdownMenuPrimitive.Group;

const DropdownMenuSub = DropdownMenuPrimitive.Sub;

const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuItem = DropdownMenuPrimitive.Item;

const DropdownMenuSubTrigger = DropdownMenuPrimitive.SubTrigger;

const DropdownMenuSubContent = forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent> & {
    portal?: boolean | React.ComponentProps<typeof DropdownMenuPortal>;
  }
>(({ className, portal = true, ...props }, ref) => {
  const content = (
    <DropdownMenuPrimitive.SubContent
      className={cn(
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-md border border-gray-200 bg-white p-1 shadow-lg data-[state=closed]:animate-out data-[state=open]:animate-in dark:border-gray-800 dark:bg-gray-950',
        className,
      )}
      ref={ref}
      {...props}
    />
  );

  return portal ? (
    <DropdownMenuPortal {...(typeof portal === 'object' ? portal : {})}>
      {content}
    </DropdownMenuPortal>
  ) : (
    content
  );
});
DropdownMenuSubContent.displayName =
  DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuContent = forwardRef<
  React.ComponentRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & {
    portal?: boolean;
  }
>(({ className, sideOffset = 4, portal = false, ...props }, ref) => {
  const content = (
    <DropdownMenuPrimitive.Content
      className={cn(
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-md border border-gray-200 bg-white p-1 shadow-md data-[state=closed]:animate-out data-[state=open]:animate-in dark:border-gray-800 dark:bg-gray-950',
        className,
      )}
      onCloseAutoFocus={(e) => e.preventDefault()}
      ref={ref}
      sideOffset={sideOffset}
      {...props}
    />
  );

  return portal ? (
    <DropdownMenuPortal {...(typeof portal === 'object' ? portal : {})}>
      {content}
    </DropdownMenuPortal>
  ) : (
    content
  );
});
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
