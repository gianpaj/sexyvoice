---
name: utils-animation-frame
description: useAnimationFrame for frame-synced callbacks
---

# useAnimationFrame

`useAnimationFrame` runs a callback on Motion’s animation frame loop, with timestamp and delta. Use when you need logic that runs in sync with Motion’s updates (e.g. custom physics or synced timers). In static mode it does not run.

## Usage

### Basic

```jsx
import { useAnimationFrame } from "motion/react"

function Component() {
  useAnimationFrame((t, delta) => {
    // t: time since effect mounted (ms)
    // delta: time since last frame (ms)
    console.log(t, delta)
  })

  return <motion.div />
}
```

### Custom Drive

```jsx
const x = useMotionValue(0)

useAnimationFrame((_, delta) => {
  x.set(x.get() + delta * 0.1)
})
```

### With Cleanup

The effect cleans up and cancels the frame subscription when the component unmounts or the callback dependency changes.

## Key Points

- Callback receives `(timestampSinceStart, delta)` in milliseconds.
- Uses Motion’s frameloop (same as animations); not `requestAnimationFrame` directly.
- No-op when `MotionConfig isStatic` is true.
- Use for values that must stay in sync with Motion’s frame updates.

<!--
Source references:
- packages/framer-motion/src/utils/use-animation-frame.ts
- motion-dom frameloop
-->
