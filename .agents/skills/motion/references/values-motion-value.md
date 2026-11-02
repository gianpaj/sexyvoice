---
name: values-motion-value
description: Create and use motion values for reactive animations
---

# useMotionValue

`useMotionValue` creates a `MotionValue` that tracks the state and velocity of a value. MotionValues can be used independently or passed to motion components via the `style` prop.

## Usage

### Basic MotionValue

```jsx
import { motion, useMotionValue } from "motion/react"

function Component() {
  const x = useMotionValue(0)

  return <motion.div style={{ x }} />
}
```

### Updating MotionValues

Update values imperatively:

```jsx
function Component() {
  const scale = useMotionValue(1)

  const handleClick = () => {
    scale.set(2)
  }

  return (
    <motion.div
      style={{ scale }}
      onClick={handleClick}
    />
  )
}
```

### Reading MotionValues

Subscribe to changes:

```jsx
import { useMotionValueEvent } from "motion/react"

function Component() {
  const x = useMotionValue(0)

  useMotionValueEvent(x, "change", (latest) => {
    console.log("x changed to:", latest)
  })

  return <motion.div style={{ x }} />
}
```

### Using with animate

Animate MotionValues directly:

```jsx
import { animate } from "motion/react"

function Component() {
  const x = useMotionValue(0)

  useEffect(() => {
    animate(x, 100, { duration: 1 })
  }, [])

  return <motion.div style={{ x }} />
}
```

## Key Points

- MotionValues are reactive values that can be animated
- Use `set()` to update values imperatively
- Use `get()` to read current value synchronously
- Subscribe to changes with `useMotionValueEvent`
- MotionValues can be passed to `style` prop
- MotionValues track velocity automatically
- Use for advanced animations and scroll-linked effects

<!--
Source references:
- https://motion.dev/docs/react/use-motion-value
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/value/use-motion-value.ts
-->
