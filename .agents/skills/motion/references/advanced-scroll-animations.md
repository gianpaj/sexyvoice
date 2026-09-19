---
name: advanced-scroll-animations
description: Scroll-linked animations and parallax effects
---

# Scroll Animations

Create scroll-linked animations using `useScroll` and `useTransform`. Perfect for parallax effects, progress indicators, and scroll-triggered animations.

## Usage

### Scroll Progress

```jsx
import { motion, useScroll, useTransform } from "motion/react"

function Component() {
  const { scrollYProgress } = useScroll()
  const opacity = useTransform(scrollYProgress, [0, 1], [1, 0])

  return <motion.div style={{ opacity }} />
}
```

### Parallax Effect

```jsx
function Parallax() {
  const { scrollY } = useScroll()
  const y = useTransform(scrollY, [0, 1000], [0, -200])

  return <motion.div style={{ y }} />
}
```

### Scroll into View

Animate when element scrolls into view:

```jsx
function Component() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  })
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 1, 0])

  return (
    <motion.div ref={ref} style={{ opacity }}>
      Content
    </motion.div>
  )
}
```

### Progress Bar

```jsx
function ProgressBar() {
  const { scrollYProgress } = useScroll()
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1])

  return (
    <motion.div
      style={{
        scaleX,
        transformOrigin: "left",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: "4px",
        background: "blue"
      }}
    />
  )
}
```

### Sticky Element

```jsx
function Sticky() {
  const { scrollYProgress } = useScroll({
    offset: ["start start", "end end"]
  })
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  return (
    <motion.div style={{ y, position: "sticky", top: 0 }}>
      Sticky content
    </motion.div>
  )
}
```

## Key Points

- `useScroll` tracks scroll position and progress
- `scrollYProgress` is 0-1 progress value
- `useTransform` maps scroll to animation values
- `offset` defines when animation starts/ends
- Works with viewport or container scroll
- Combine multiple transforms for complex effects
- Perfect for parallax and scroll-triggered animations

<!--
Source references:
- https://motion.dev/docs/react/scroll-animations
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/value/use-scroll.ts
-->
