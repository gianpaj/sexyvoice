---
name: layout-animate-presence
description: Animate components entering and exiting
---

# AnimatePresence

`AnimatePresence` enables exit animations for components that are removed from the React tree. It tracks which children are entering and exiting, and coordinates their animations.

## Usage

### Basic Exit Animation

```jsx
import { motion, AnimatePresence } from "motion/react"

function Items({ items }) {
  return (
    <AnimatePresence>
      {items.map(item => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {item.name}
        </motion.div>
      ))}
    </AnimatePresence>
  )
}
```

### Mode

Control when exiting elements are removed:

```jsx
<AnimatePresence mode="wait">
  {/* Wait for exit before entering */}
</AnimatePresence>

<AnimatePresence mode="sync">
  {/* Default: enter and exit simultaneously */}
</AnimatePresence>

<AnimatePresence mode="popLayout" anchorY="bottom">
  {/* Exiting elements "pop" from layout; siblings reflow immediately */}
</AnimatePresence>
```

- `sync` — Enter and exit at once (default)
- `wait` — Exit first, then enter
- `popLayout` — Exiting elements removed from layout flow; use `anchorX`/`anchorY` for positioning

### Initial

Control initial animation:

```jsx
<AnimatePresence initial={false}>
  {/* Skip initial animation on mount */}
</AnimatePresence>
```

### Custom

Pass custom data to variants:

```jsx
<AnimatePresence custom={direction}>
  <motion.div
    custom={direction}
    variants={variants}
    initial="enter"
    animate="center"
    exit="exit"
  />
</AnimatePresence>
```

### onExitComplete

Callback when exit animations complete:

```jsx
<AnimatePresence onExitComplete={() => {
  console.log("All exits complete")
}}>
  {/* ... */}
</AnimatePresence>
```

### Presence Affects Layout

```jsx
<AnimatePresence presenceAffectsLayout={false}>
  {/* Don't affect layout during exit */}
</AnimatePresence>
```

## Key Points

- Wrap components that need exit animations
- Each child must have a unique `key`
- `exit` prop defines exit animation
- `mode="wait"` waits for exit before enter
- `initial={false}` skips initial animation
- `onExitComplete` fires when all exits done
- Works with variants for orchestrated animations

<!--
Source references:
- https://motion.dev/docs/react/animate-presence
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/components/AnimatePresence
-->
