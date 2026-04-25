---
name: core-animation
description: Basic animation with animate, initial, and while states
---

# Basic Animation

Motion components animate using the `animate`, `initial`, and `while` props. These props accept objects of animatable properties.

## Usage

### Basic Animation

```jsx
import { motion } from "motion/react"

function Component() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      Fades in and moves down
    </motion.div>
  )
}
```

### Initial State

The `initial` prop defines the starting animation state:

```jsx
<motion.div
  initial={{ scale: 0, rotate: -180 }}
  animate={{ scale: 1, rotate: 0 }}
/>
```

### Animate State

The `animate` prop defines the target animation state:

```jsx
<motion.div
  animate={{ 
    x: 100,
    y: 50,
    scale: 1.5,
    rotate: 45,
    opacity: 0.8
  }}
/>
```

### While States

Animate based on interaction states:

```jsx
<motion.div
  initial={{ scale: 1 }}
  whileHover={{ scale: 1.1 }}
  whileTap={{ scale: 0.9 }}
  whileFocus={{ scale: 1.05 }}
  whileInView={{ opacity: 1 }}
/>
```

## Animatable Properties

### Transform Properties

Shortcuts for transform values:

- `x`, `y`, `z` - Translation
- `rotate`, `rotateX`, `rotateY`, `rotateZ` - Rotation (degrees)
- `scale`, `scaleX`, `scaleY` - Scale
- `skew`, `skewX`, `skewY` - Skew

### values (Custom MotionValues)

Pass MotionValues to animate custom or derived properties:

```jsx
const distance = useMotionValue(100)
const angle = useMotionValue(0)
const x = useTransform([distance, angle], ([d, a]) => Math.cos(a) * d)
const y = useTransform([distance, angle], ([d, a]) => Math.sin(a) * d)

<motion.div
  values={{ distance, angle }}
  animate={{ distance: 50, angle: Math.PI }}
  style={{ x, y }}
/>
```

Use when animating values that drive `useTransform` or when you need to animate custom properties.

### Style Properties

Standard CSS properties:

- `opacity` - Opacity (0-1)
- `backgroundColor` - Color values
- `borderRadius` - Border radius
- `width`, `height` - Dimensions
- Any CSS property

### SVG Properties

SVG-specific properties:

- `pathLength` - Path drawing animation
- `pathOffset` - Path offset
- `pathSpacing` - Path spacing

## Keyframe Animations

Use arrays for keyframe animations:

```jsx
<motion.div
  animate={{
    x: [0, 100, 200, 0],
    scale: [1, 1.5, 1],
    rotate: [0, 90, 180, 0]
  }}
  transition={{ duration: 2 }}
/>
```

## Key Points

- `initial` sets starting state (only on mount)
- `animate` sets target state (updates reactively)
- `while*` props animate on specific interactions
- Transform shortcuts (x, y, scale) are more performant than CSS transform
- Arrays create keyframe sequences
- All CSS properties are animatable

<!--
Source references:
- https://motion.dev/docs/react/animate
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/motion
-->
