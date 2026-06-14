---
name: values-follow
description: useFollowValue — motion value that animates to a source with any transition
---

# useFollowValue

`useFollowValue` creates a MotionValue that follows another value or initial value with a configurable transition. Unlike `useSpring`, it supports tween, inertia, keyframes, and custom transitions. Use when you need a “slave” value that animates to a “source” with non-spring timing.

## Usage

### Standalone with Initial Value

```jsx
import { useFollowValue } from "motion/react"

const x = useFollowValue(0, { type: "tween", duration: 0.5, ease: "easeOut" })
x.set(100) // animates to 100
```

### Spring (default-like)

```jsx
const x = useFollowValue(0, { type: "spring", stiffness: 300, damping: 20 })
```

### Follow Another MotionValue

```jsx
const source = useMotionValue(0)
const smoothed = useFollowValue(source, { type: "spring", damping: 15 })

// When source changes, smoothed animates toward it
source.set(100)
```

### Inertia

```jsx
const x = useFollowValue(0, { type: "inertia", velocity: 100 })
```

### Keyframes

```jsx
const x = useFollowValue(0, {
  type: "keyframes",
  keyframes: [0, 50, 100],
  duration: 1,
})
```

## Key Points

- First arg: number/string or MotionValue to follow; second: transition options.
- Supports `spring`, `tween`, `inertia`, `keyframes` (same as component transitions).
- When source is a MotionValue, the follow value updates whenever the source is set.
- In static config (`MotionConfig isStatic`), behaves like a simple transform of the source.

<!--
Source references:
- packages/framer-motion/src/value/use-follow-value.ts
- motion-dom attachFollow, FollowValueOptions
-->
