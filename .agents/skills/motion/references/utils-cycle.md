---
name: utils-cycle
description: useCycle to cycle through a list of states
---

# useCycle

`useCycle` returns the current item from a list and a function to advance to the next (or jump to an index). Use for toggles or multi-state cycles (e.g. animating between several variants).

## Usage

### Cycle Through Values

```jsx
import { motion, useCycle } from "motion/react"

function Component() {
  const [x, cycleX] = useCycle(0, 50, 100)

  return (
    <motion.div
      animate={{ x }}
      onTap={() => cycleX()}
    />
  )
}
```

### Jump to Index

```jsx
const [mode, setMode] = useCycle("idle", "hover", "tap")

setMode(0)   // idle
setMode(1)   // hover
setMode()    // next: tap, then back to idle
```

### With Variants

```jsx
const [variant, cycleVariant] = useCycle("a", "b", "c")

return (
  <motion.div
    variants={{ a: {...}, b: {...}, c: {...} }}
    animate={variant}
    onTap={() => cycleVariant()}
  />
)
```

## Key Points

- `useCycle(...items)` returns `[currentItem, cycle]`.
- `cycle()` advances to next; `cycle(index)` jumps to that index (wraps with `wrap()`).
- Useful for tap/hover toggles and small fixed sets of states.
- TypeScript: state and cycle are typed from the items array.

<!--
Source references:
- packages/framer-motion/src/utils/use-cycle.ts
-->
