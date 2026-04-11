---
name: values-transform
description: Transform motion values with functions
---

# useTransform

`useTransform` creates a new MotionValue by transforming another MotionValue through a function or range mapping.

## Usage

### Function Transform

Transform a value through a function:

```jsx
import { motion, useMotionValue, useTransform } from "motion/react"

function Component() {
  const x = useMotionValue(0)
  const opacity = useTransform(x, [0, 100], [1, 0])
  const scale = useTransform(x, (value) => value / 100)

  return (
    <motion.div
      style={{ x, opacity, scale }}
    />
  )
}
```

### Range Mapping

Map input range to output range:

```jsx
// Map 0-100 to 0-1
const progress = useTransform(x, [0, 100], [0, 1])

// Map scroll position to opacity
const opacity = useTransform(scrollY, [0, 500], [1, 0])
```

### Multiple Inputs

Transform multiple MotionValues:

```jsx
const combined = useTransform(
  [x, y],
  ([latestX, latestY]) => latestX + latestY
)
```

### Clamp Values

Clamp output to a range:

```jsx
const clamped = useTransform(
  x,
  [0, 100],
  [0, 1],
  { clamp: true }
)
```

## Common Patterns

### Scroll-Linked Opacity

```jsx
function Component() {
  const { scrollYProgress } = useScroll()
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])

  return <motion.div style={{ opacity }} />
}
```

### Color Interpolation

```jsx
const color = useTransform(
  progress,
  [0, 1],
  ["#000", "#fff"]
)
```

### Rotation from Position

```jsx
const rotate = useTransform(
  x,
  [0, window.innerWidth],
  [0, 360]
)
```

## Key Points

- Transform one MotionValue into another
- Use arrays for range mapping: `[inputMin, inputMax], [outputMin, outputMax]`
- Use functions for custom transformations
- Multiple inputs can be transformed together
- `clamp` option limits output range
- Transforms are reactive and update automatically
- Useful for scroll-linked animations and value mapping

<!--
Source references:
- https://motion.dev/docs/react/use-transform
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/value/use-transform.ts
-->
