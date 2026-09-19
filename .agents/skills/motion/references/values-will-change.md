---
name: values-will-change
description: useWillChange for GPU layer hint and performance
---

# useWillChange

`useWillChange` returns a MotionValue that can be bound to the CSS `will-change` property. Motion sets it to the animating properties during animation to promote the element to its own layer and then clears it when idle. Use for performance tuning when animating transform/opacity on many elements.

## Usage

### Basic

```jsx
import { motion, useWillChange } from "motion/react"

function Component() {
  const willChange = useWillChange()

  return <motion.div style={{ willChange }} animate={{ x: 100 }} />
}
```

Motion will set `willChange.get()` to values like `"transform"` or `"opacity"` while animating and reset when done. Do not set it manually unless you need a fixed hint.

### With layoutId

Useful when combining with layout animations so the browser can optimize:

```jsx
const willChange = useWillChange()
return (
  <motion.div layoutId="card" style={{ willChange }} layout>
    ...
  </motion.div>
)
```

## Key Points

- Returns a `WillChange` (MotionValue-like) for the `style` prop.
- Motion updates it during animations; typically leave it to the library.
- Helps GPU compositing; avoid overusing (e.g. on every element) to prevent memory pressure.
- SSR-safe; value is appropriate for server render.

<!--
Source references:
- packages/framer-motion/src/value/use-will-change/index.ts
- motion-dom value/will-change
-->
