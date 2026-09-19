---
name: values-scroll
description: Scroll-linked motion values and animations
---

# useScroll

`useScroll` creates MotionValues that track scroll position and progress. Use for scroll-linked animations and parallax effects.

## Usage

### Basic Scroll Tracking

```jsx
import { motion, useScroll } from "motion/react"

function Component() {
  const { scrollY, scrollYProgress } = useScroll()

  return (
    <motion.div
      style={{
        opacity: scrollYProgress,
        y: useTransform(scrollYProgress, [0, 1], [0, -100])
      }}
    />
  )
}
```

### Scroll Values

`useScroll` returns:

- `scrollX` - Horizontal scroll position (pixels)
- `scrollY` - Vertical scroll position (pixels)
- `scrollXProgress` - Horizontal scroll progress (0-1)
- `scrollYProgress` - Vertical scroll progress (0-1)

### Container Scroll

Track scroll within a specific container:

```jsx
const containerRef = useRef(null)

const { scrollYProgress } = useScroll({
  container: containerRef
})

return (
  <div ref={containerRef} style={{ overflow: "auto", height: "500px" }}>
    <motion.div style={{ opacity: scrollYProgress }} />
  </div>
)
```

### Target Element Scroll

Track when a target element scrolls into view:

```jsx
const targetRef = useRef(null)

const { scrollYProgress } = useScroll({
  target: targetRef,
  offset: ["start end", "end start"]
})

return (
  <>
    <div style={{ height: "200vh" }} />
    <motion.div
      ref={targetRef}
      style={{ opacity: scrollYProgress }}
    />
  </>
)
```

### Scroll Offset

Define when animation starts/ends:

```jsx
const { scrollYProgress } = useScroll({
  offset: ["start start", "end end"]
  // Animation starts when element start meets viewport start
  // Animation ends when element end meets viewport end
})
```

Offset options:
- `"start start"` - Element start meets viewport start
- `"start end"` - Element start meets viewport end
- `"end start"` - Element end meets viewport start
- `"end end"` - Element end meets viewport end
- Or pixel values: `[0, 0.5]` for custom ranges

## Common Patterns

### Fade on Scroll

```jsx
const { scrollYProgress } = useScroll()
const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])

return <motion.div style={{ opacity }} />
```

### Parallax Effect

```jsx
const { scrollY } = useScroll()
const y = useTransform(scrollY, [0, 1000], [0, -200])

return <motion.div style={{ y }} />
```

### Progress Indicator

```jsx
const { scrollYProgress } = useScroll()
const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1])

return (
  <motion.div
    style={{
      scaleX,
      transformOrigin: "left"
    }}
  />
)
```

## Key Points

- `scrollY`/`scrollX` track pixel position
- `scrollYProgress`/`scrollXProgress` track 0-1 progress
- Use `container` to track scroll within element
- Use `target` to track when element scrolls into view
- `offset` defines animation start/end points
- Combine with `useTransform` for scroll-linked animations
- Works with viewport or container scrolling

<!--
Source references:
- https://motion.dev/docs/react/use-scroll
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/value/use-scroll.ts
-->
