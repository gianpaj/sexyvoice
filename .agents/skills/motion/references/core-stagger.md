---
name: core-stagger
description: stagger() for orchestrating child animation delays
---

# stagger

`stagger` creates a delay function for `delayChildren` in variants. Use it to animate children in sequence with configurable origin and easing.

## Usage

### Basic Stagger

```jsx
import { motion, stagger } from "motion/react"

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: stagger(0.1),
    },
  },
}

const item = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1 },
}

function List() {
  return (
    <motion.ul variants={container} initial="hidden" animate="visible">
      <motion.li variants={item}>A</motion.li>
      <motion.li variants={item}>B</motion.li>
      <motion.li variants={item}>C</motion.li>
    </motion.ul>
  )
}
```

### Stagger From Different Origins

```jsx
// From center outward
delayChildren: stagger(0.1, { from: "center" })

// From last item
delayChildren: stagger(0.1, { from: "last" })

// From first (default)
delayChildren: stagger(0.1, { from: "first" })

// From specific index
delayChildren: stagger(0.1, { from: 2 })
```

### With Easing

```jsx
delayChildren: stagger(0.1, {
  from: "last",
  startDelay: 0.2,
  ease: "easeOut",
})
```

### Options

| Option | Type | Description |
|--------|------|-------------|
| `from` | `"first" \| "last" \| "center" \| number` | Origin index for stagger |
| `startDelay` | number | Delay before first child |
| `ease` | Easing | Easing for the stagger curve |

## Key Points

- Pass `stagger(interval)` or `stagger(interval, options)` to `delayChildren`
- Returns a function `(i, total) => delay` used internally by Motion
- `from: "center"` staggers from middle outward
- Combine with `staggerChildren` for nested orchestration

<!--
Source references:
- packages/motion-dom/src/utils/stagger.ts
- packages/motion-dom/src/animation/utils/calc-child-stagger.ts
-->
