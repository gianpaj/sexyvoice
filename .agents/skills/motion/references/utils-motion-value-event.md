---
name: utils-motion-value-event
description: Subscribe to motion value events (change, animationStart, animationComplete)
---

# useMotionValueEvent

`useMotionValueEvent` subscribes to MotionValue events. Use it to react to value changes, animation start/complete, or run side effects when motion values update.

## Usage

### Change Event

React to value changes:

```jsx
import { motion, useMotionValue, useMotionValueEvent } from "motion/react"

function Component() {
  const x = useMotionValue(0)

  useMotionValueEvent(x, "change", (latest) => {
    console.log("x changed to:", latest)
  })

  return <motion.div drag="x" style={{ x }} />
}
```

### Animation Lifecycle

Listen to animation start and complete:

```jsx
useMotionValueEvent(opacity, "animationStart", () => {
  console.log("Animation started")
})

useMotionValueEvent(opacity, "animationComplete", () => {
  console.log("Animation finished")
})

useMotionValueEvent(opacity, "animationCancel", () => {
  console.log("Animation cancelled")
})
```

### Sync External State

Sync MotionValue to React state or external systems:

```jsx
const scrollProgress = useScroll().scrollYProgress
const [label, setLabel] = useState("")

useMotionValueEvent(scrollProgress, "change", (latest) => {
  setLabel(latest > 0.5 ? "Past halfway" : "Before halfway")
})
```

### Destroy Cleanup

React to MotionValue destruction:

```jsx
useMotionValueEvent(value, "destroy", () => {
  // Cleanup when value is destroyed
})
```

## Event Types

| Event | Callback | When |
|-------|----------|------|
| `change` | `(latest: V) => void` | Value changes |
| `animationStart` | `() => void` | Animation begins |
| `animationComplete` | `() => void` | Animation finishes |
| `animationCancel` | `() => void` | Animation cancelled |
| `destroy` | `() => void` | MotionValue destroyed |

## Key Points

- Uses `useInsertionEffect` so subscriptions run before other effects
- Subscribes to MotionValue's `on()` method
- Pass the same MotionValue reference to avoid unnecessary resubscriptions
- Callback identity matters — wrap in `useCallback` if passing a function that changes
- For one-off reads, use `value.get()`; for reactive updates, use `useMotionValueEvent`

<!--
Source references:
- packages/framer-motion/src/utils/use-motion-value-event.ts
- packages/motion-dom/src/value/index.ts (MotionValueEventCallbacks)
-->
