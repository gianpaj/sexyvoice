"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"

type TooltipEventsContextValue = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onTouchStart: () => void;
  onKeyDown: React.KeyboardEventHandler<HTMLButtonElement>;
};

const TooltipEventsContext = React.createContext<TooltipEventsContextValue>({
  open: false,
  setOpen: () => {},
  onClick: () => {},
  onMouseEnter: () => {},
  onMouseLeave: () => {},
  onTouchStart: () => {},
  onKeyDown: () => {},
});

function TooltipEventsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  const onClick = () => setOpen((prev) => !prev);
  const onMouseEnter = () => setOpen(true);
  const onMouseLeave = () => setOpen(false);
  const onTouchStart = () => setOpen((prev) => !prev);
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (e.key === "Enter") {
      setOpen((prev) => !prev);
    }
  };

  return (
    <TooltipEventsContext.Provider
      value={{
        open,
        setOpen,
        onClick,
        onMouseEnter,
        onMouseLeave,
        onTouchStart,
        onKeyDown,
      }}
    >
      {children}
    </TooltipEventsContext.Provider>
  );
}

function useTooltipEvents() {
  const context = React.useContext(TooltipEventsContext);
  if (!context) {
    throw new Error(
      "useTooltipEvents must be used within a TooltipEventsProvider",
    );
  }
  return context;
}

export function TooltipProvider(
  props: React.ComponentProps<typeof TooltipPrimitive.Provider>,
) {
  return (
    <TooltipEventsProvider>
      <TooltipPrimitive.Provider {...props} />
    </TooltipEventsProvider>
  );
}

export function Tooltip(
  props: React.ComponentProps<typeof TooltipPrimitive.Root>,
) {
  const { open, setOpen } = useTooltipEvents();
  return (
    <TooltipPrimitive.Root open={open} onOpenChange={setOpen} {...props} />
  );
}

export function TooltipTrigger(
  props: React.ComponentProps<typeof TooltipPrimitive.Trigger>,
) {
  const { onClick, onMouseEnter, onMouseLeave, onTouchStart, onKeyDown } =
    useTooltipEvents();
  return (
    <TooltipPrimitive.Trigger
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onKeyDown={onKeyDown}
      {...props}
    />
  );
}

export function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-fit [&>p]:text-sm origin-(--radix-tooltip-content-transform-origin) animate-in rounded-md bg-background border px-3 py-1.5 text-xs text-balance text-foreground fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-background fill-background border-b border-r" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
