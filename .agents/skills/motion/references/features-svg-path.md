---
name: features-svg-path
description: SVG path animation with pathLength, pathOffset, pathSpacing
---

# SVG Path Animation

Motion animates SVG `path` elements with special properties: `pathLength`, `pathOffset`, and `pathSpacing`. Use for draw-on effects, progress indicators, and path-based animations.

## Usage

### pathLength — Draw Effect

Animate a path drawing from 0 to 1:

```jsx
import { motion } from "motion/react"

<motion.path
  d="M 10 80 Q 95 10 180 80"
  initial={{ pathLength: 0 }}
  animate={{ pathLength: 1 }}
  transition={{ duration: 2 }}
/>
```

pathLength is normalized 0–1; Motion handles the `stroke-dasharray` / `stroke-dashoffset` math.

### pathOffset — Stroke Offset

Shift where the stroke starts:

```jsx
<motion.path
  d="..."
  pathLength={1}
  initial={{ pathOffset: 0 }}
  animate={{ pathOffset: 1 }}
  transition={{ duration: 1, repeat: Infinity }}
/>
```

pathOffset 0–1 moves the visible stroke along the path.

### pathSpacing — Spacing Between Strokes

Control spacing when using dashed paths:

```jsx
<motion.path
  d="..."
  pathLength={1}
  pathSpacing={0.1}
  animate={{ pathOffset: 1 }}
/>
```

### Combined with Other Props

```jsx
<motion.path
  d={complexPath}
  fill="none"
  stroke="currentColor"
  strokeWidth={2}
  initial={{ pathLength: 0, opacity: 0 }}
  animate={{ pathLength: 1, opacity: 1 }}
  exit={{ pathLength: 0, opacity: 0 }}
  transition={{ duration: 1.5, ease: "easeInOut" }}
/>
```

### Progress Indicator

Use pathLength with a MotionValue for scroll- or gesture-driven progress:

```jsx
import { motion, useScroll, useTransform } from "motion/react"

const { scrollYProgress } = useScroll()

<motion.path
  d="M 10 50 A 40 40 0 0 1 90 50"
  pathLength={1}
  fill="none"
  stroke="blue"
  strokeWidth="4"
  style={{ pathLength: scrollYProgress }}
/>
```

## Key Points

- `pathLength`: 0–1, controls how much of the path is "drawn"
- `pathOffset`: 0–1, offsets the start of the stroke
- `pathSpacing`: spacing between stroke segments
- Works with `initial`, `animate`, `whileHover`, variants
- Use `fill="none"` and `stroke` for line paths
- Compatible with MotionValues for scroll- or gesture-driven animation

<!--
Source references:
- packages/motion-dom/src/effects/svg
- packages/framer-motion/src/motion (SVG path props)
- core-animation.md (SVG Properties)
-->
