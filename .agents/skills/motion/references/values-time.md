---
name: values-time
description: Time-based motion values
---

# useTime

`useTime` creates a MotionValue that tracks elapsed time. Useful for time-based animations and continuous updates.

## Usage

### Basic Time Tracking

```jsx
import { motion, useTime, useTransform } from "motion/react"

function Component() {
  const time = useTime()
  const rotate = useTransform(time, (t) => t / 10)

  return <motion.div style={{ rotate }} />
}
```

### Animated Rotation

Continuous rotation:

```jsx
const time = useTime()
const rotate = useTransform(time, [0, 10000], [0, 360], { clamp: false })

return <motion.div style={{ rotate }} />
```

### Pulsing Animation

```jsx
const time = useTime()
const scale = useTransform(
  time,
  [0, 1000, 2000],
  [1, 1.2, 1],
  { repeat: Infinity }
)
```

## Key Points

- Time value increases continuously
- Use with `useTransform` for time-based animations
- Time is in milliseconds
- Useful for continuous animations
- Can create looping animations
- Combine with other transforms for complex effects

<!--
Source references:
- https://motion.dev/docs/react/use-time
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/value/use-time.ts
-->
