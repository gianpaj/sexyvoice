import { forwardRef } from "react"
import { cn } from "@/lib/tiptap-utils"


const Card = forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative flex flex-col min-w-0 break-words bg-white dark:bg-gray-950 bg-clip-border border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm outline-none",
          className
        )}
        {...props}
      />
    )
  }
)
Card.displayName = "Card"

const CardHeader = forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center justify-between flex-shrink-0 w-full p-1.5 border-b border-gray-200 dark:border-gray-800",
          className
        )}
        {...props}
      />
    )
  }
)
CardHeader.displayName = "CardHeader"

const CardBody = forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex-auto p-1.5 overflow-y-auto", className)}
        {...props}
      />
    )
  }
)
CardBody.displayName = "CardBody"

const CardItemGroup = forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    orientation?: "horizontal" | "vertical"
  }
>(({ className, orientation = "vertical", ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-orientation={orientation}
      className={cn(
        "relative flex min-w-max align-middle",
        orientation === "vertical" ? "flex-col justify-center" : "flex-row items-center gap-1",
        className
      )}
      {...props}
    />
  )
})
CardItemGroup.displayName = "CardItemGroup"

const CardGroupLabel = forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "pt-3 pl-2 pr-2 pb-1 text-xs font-semibold capitalize text-gray-800 dark:text-gray-200 leading-normal",
          className
        )}
        {...props}
      />
    )
  }
)
CardGroupLabel.displayName = "CardGroupLabel"

const CardFooter = forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("border-t border-gray-200 dark:border-gray-800 p-1.5", className)}
        {...props}
      />
    )
  }
)
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardBody, CardItemGroup, CardGroupLabel }
