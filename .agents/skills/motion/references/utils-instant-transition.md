---
name: utils-instant-transition
description: useInstantTransition and disableInstantTransitions for layout updates
---

# useInstantTransition & disableInstantTransitions

`useInstantTransition` blocks layout animations for one frame during a layout update, then re-enables them. Use when you need to update layout (e.g. with `React.startTransition`) without triggering layout animations on the change.

## Usage

### useInstantTransition

Returns a function that runs a callback with animations temporarily disabled:

```jsx
import { useInstantTransition } from "motion/react"

function Component() {
  const startInstantTransition = useInstantTransition()

  const handleLayoutChange = () => {
    startInstantTransition(() => {
      // Layout updates here won't trigger layout animations
      setExpanded(!expanded)
    })
  }

  return (
    <motion.div layout onClick={handleLayoutChange}>
      {expanded ? <ExpandedContent /> : <CollapsedContent />}
    </motion.div>
  )
}
```

### With React.startTransition

```jsx
startInstantTransition(() => {
  startTransition(() => {
    setState(newState)
  })
})
```

### disableInstantTransitions

Globally disable instant transitions (e.g. to re-enable layout animations after a manual block):

```jsx
import { disableInstantTransitions } from "motion/react"

// Force animations back on
disableInstantTransitions()
```

## When to Use

- Layout changes that should not animate (e.g. immediate expand/collapse)
- Coordinating with `React.startTransition` for non-blocking updates
- Avoiding layout animation conflicts during programmatic DOM changes

## Key Points

- Different from `useInstantLayoutTransition` (which blocks layout *measurement* for one frame)
- `useInstantTransition` sets `MotionGlobalConfig.instantAnimations = true` during the callback
- Animations are unblocked after two animation frames
- Use when you want layout to update without animating

<!--
Source references:
- packages/framer-motion/src/utils/use-instant-transition.ts
-->
