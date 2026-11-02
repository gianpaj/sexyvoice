---
name: core-vanilla-motion-value
description: motionValue() for creating MotionValues without React
---

# motionValue (Vanilla)

`motionValue` creates a `MotionValue` without React. Use in vanilla JavaScript, Node, or when you need a MotionValue outside of a component.

## Usage

### Create MotionValue

```js
import { motionValue } from "motion/react"

const x = motionValue(0)
const opacity = motionValue(1)
const scale = motionValue(1)
```

### Read and Update

```js
x.get()       // Read current value
x.set(100)    // Update value
x.set(prev => prev + 10)  // Update from previous
```

### Subscribe to Changes

```js
const unsubscribe = x.on("change", (latest) => {
  console.log("x is now:", latest)
})

// Later: unsubscribe()
```

### Animate

```js
import { animate, motionValue } from "motion/react"

const x = motionValue(0)
const controls = animate(x, 100, { duration: 1 })

controls.pause()
controls.play()
controls.stop()
```

### Pass to animate() for Elements

```js
const progress = motionValue(0)

animate("#progress-bar", {
  scaleX: progress,
}, { duration: 0 })
```

### With scroll()

```js
import { scroll, motionValue } from "motion/react"

const opacity = motionValue(1)

scroll((progress) => {
  opacity.set(1 - progress)
})
```

## React vs Vanilla

| React | Vanilla |
|-------|---------|
| `useMotionValue(0)` | `motionValue(0)` |
| Recreated per render (with hook) | Create once, reuse |
| Use in components | Use anywhere |

## Key Points

- Same API as `MotionValue` instances from `useMotionValue`
- Use `get()`, `set()`, `on()` for read/write/subscribe
- Compatible with `animate()`, `useTransform` (in React), `scroll()`, etc.
- Import from `motion/react` or `motion` (dom entry)

<!--
Source references:
- packages/motion-dom/src/value/index.ts (motionValue)
-->
