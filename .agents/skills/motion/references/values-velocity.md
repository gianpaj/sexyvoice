---
name: values-velocity
description: Access velocity of motion values
---

# useVelocity

`useVelocity` creates a MotionValue that tracks the velocity of another MotionValue. Useful for momentum-based animations and physics effects.

## Usage

### Basic Velocity

```jsx
import { motion, useMotionValue, useVelocity } from "motion/react"

function Component() {
  const x = useMotionValue(0)
  const velocity = useVelocity(x)

  return (
    <motion.div
      style={{ x }}
      onMouseMove={(e) => x.set(e.clientX)}
    />
  )
}
```

### Velocity-Based Effects

Use velocity to drive animations:

```jsx
function Component() {
  const x = useMotionValue(0)
  const velocity = useVelocity(x)
  const scale = useTransform(
    velocity,
    [-1000, 0, 1000],
    [1.2, 1, 1.2]
  )

  return (
    <motion.div
      style={{ x, scale }}
      drag="x"
    />
  )
}
```

### Momentum Animation

Animate based on velocity:

```jsx
import { animate, useMotionValue, useVelocity } from "motion/react"

function Component() {
  const x = useMotionValue(0)
  const velocity = useVelocity(x)

  const handleDragEnd = () => {
    const currentVelocity = velocity.get()
    animate(x, x.get() + currentVelocity * 0.1, {
      type: "inertia",
      velocity: currentVelocity
    })
  }

  return (
    <motion.div
      style={{ x }}
      drag="x"
      onDragEnd={handleDragEnd}
    />
  )
}
```

## Key Points

- Velocity tracks rate of change of a MotionValue
- Positive velocity = increasing value
- Negative velocity = decreasing value
- Velocity updates in real-time
- Use for momentum-based animations
- Combine with `useTransform` for velocity-driven effects
- Useful for drag interactions and physics simulations

<!--
Source references:
- https://motion.dev/docs/react/use-velocity
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/value/use-velocity.ts
-->
