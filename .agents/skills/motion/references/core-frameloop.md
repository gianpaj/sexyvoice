---
name: core-frameloop
description: frame, cancelFrame for Motion's animation loop
---

# frame & cancelFrame

Motion uses a batched animation loop. `frame` schedules callbacks to run in sync with this loop; `cancelFrame` cancels them. Use for custom animations, measurements, or frame-synced logic.

## Usage

### Schedule Callback

```js
import { frame } from "motion/react"

// Run on next frame (read phase)
frame.read(() => {
  const rect = element.getBoundingClientRect()
  console.log(rect)
})

// Run before layout updates (default)
frame.preRender(callback)

// Run after render
frame.postRender(() => {
  console.log("Render complete")
})

// Update phase (writes)
frame.update((timestamp) => {
  element.style.transform = `translateX(${x}px)`
})
```

### Cancel

```js
import { frame, cancelFrame } from "motion/react"

const process = frame.read(() => {
  // ...
})

cancelFrame(process)
```

### frameData

Access current frame timestamp:

```js
import { frameData } from "motion/react"

frame.read(() => {
  console.log(frameData.timestamp)
})
```

### setup (High Priority)

```js
frame.setup(callback, true)  // Keep alive / run every frame
```

## Phases

- `frame.read` — Read phase (measurements, no DOM writes)
- `frame.preRender` — Before layout
- `frame.update` — Update phase
- `frame.postRender` — After render

## Key Points

- Aligns with Motion's `requestAnimationFrame` batching
- Use `cancelFrame` to prevent leaks
- `frameData` provides `timestamp` for the current frame
- Useful for custom animators or performance-sensitive code

<!--
Source references:
- packages/motion-dom/src/frameloop/frame.ts
- packages/motion-dom/src/frameloop/batcher.ts
-->
