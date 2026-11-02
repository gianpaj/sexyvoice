---
name: values-spring
description: Spring-based motion values with physics
---

# useSpring

`useSpring` creates a MotionValue that follows another MotionValue using spring physics. Useful for creating smooth, natural-feeling animations that follow other values.

## Usage

### Basic Spring

```jsx
import { motion, useMotionValue, useSpring } from "motion/react"

function Component() {
  const x = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 100, damping: 10 })

  return (
    <motion.div
      style={{ x: springX }}
      onMouseMove={(e) => x.set(e.clientX)}
    />
  )
}
```

### Spring Configuration

Customize spring physics:

```jsx
const springX = useSpring(x, {
  stiffness: 300,  // Spring stiffness (higher = stiffer)
  damping: 30,     // Spring damping (higher = less bouncy)
  mass: 1          // Spring mass (higher = slower)
})
```

### Quick Spring Presets

Use preset configurations:

```jsx
import { useSpring } from "motion/react"

// Gentle spring
const gentle = useSpring(x, { stiffness: 120, damping: 14 })

// Wobbly spring
const wobbly = useSpring(x, { stiffness: 180, damping: 12 })

// Stiff spring
const stiff = useSpring(x, { stiffness: 210, damping: 20 })
```

## Use Cases

### Smooth Mouse Following

```jsx
function MouseFollower() {
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const springX = useSpring(mouseX)
  const springY = useSpring(mouseY)

  return (
    <motion.div
      style={{ x: springX, y: springY }}
      onMouseMove={(e) => {
        mouseX.set(e.clientX)
        mouseY.set(e.clientY)
      }}
    />
  )
}
```

### Smooth Value Transitions

```jsx
function Component() {
  const target = useMotionValue(0)
  const smooth = useSpring(target, { stiffness: 200, damping: 20 })

  const toggle = () => {
    target.set(target.get() === 0 ? 100 : 0)
  }

  return (
    <motion.div
      style={{ x: smooth }}
      onClick={toggle}
    />
  )
}
```

## Key Points

- Springs create natural, physics-based motion
- Higher stiffness = faster, more responsive
- Higher damping = less bouncy, more controlled
- Use for smooth following animations
- Springs automatically handle velocity and momentum
- Can be used with any MotionValue source

<!--
Source references:
- https://motion.dev/docs/react/use-spring
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/value/use-spring.ts
-->
