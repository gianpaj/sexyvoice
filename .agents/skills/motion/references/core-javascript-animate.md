---
name: core-javascript-animate
description: Vanilla animate() API and animation sequences for elements, motion values, and objects
---

# JavaScript animate() and Sequences

Motion exposes an imperative `animate()` function for JavaScript (and React). It animates DOM elements, MotionValues, or plain objects. Supports keyframes, transitions, and timeline sequences.

## Usage

### Animate Element

```js
import { animate } from "motion/react"

animate("#box", { x: 100, opacity: 0.5 })
animate(".item", { scale: 1.2 }, { duration: 0.5, ease: "easeOut" })
```

Selector or element:

```js
animate(document.querySelector(".card"), { y: 20 })
```

### Options

```js
animate(el, keyframes, {
  duration: 0.6,
  delay: 0.2,
  ease: "easeInOut",
  repeat: Infinity,
  repeatType: "reverse",
  onComplete: () => {},
})
```

### Keyframes

Array keyframes for multiple steps:

```js
animate(el, {
  x: [0, 100, 200],
  opacity: [1, 0.5, 1],
})
```

### Scoped Animate

`createScopedAnimate` creates an animate function scoped to a root element or with reduced motion:

```js
import { createScopedAnimate } from "motion/react"

const scopedAnimate = createScopedAnimate({
  scope: document.getElementById("root"),
  reduceMotion: true,
})
scopedAnimate(".child", { opacity: 0 })
```

### Animation Sequences (Timeline)

Pass an array of segments to run animations in sequence. Use `at` for timing, `"<"` for overlap with previous, `"+0.5"` for offset.

```js
import { animate } from "motion/react"

animate([
  [".a", { x: 100 }, { duration: 0.5 }],
  [".b", { x: 100 }, { at: "+0.2" }],
  [".c", { opacity: 0 }, { at: "<" }],
  ["label", { at: 0.5 }],
  [".d", { scale: 1.2 }, { at: "label" }],
])
```

Segment types: `[element, keyframes, options?]`, `[motionValue, keyframes, options?]`, `[object, keyframes, options?]`, or label `"name"` / `[{ name: "name", at: 0.5 }]`.

Sequence options:

```js
animate(sequence, {
  delay: 0,
  duration: 1,
  defaultTransition: { type: "spring", stiffness: 100 },
  reduceMotion: false,
})
```

### Return Value

`animate()` returns `AnimationPlaybackControls`: `.play()`, `.pause()`, `.stop()`, `.then(callback)`, `.cancel()`.

## Key Points

- Import `animate` from `motion/react` (React) or `motion` (vanilla).
- First arg: element/selector, MotionValue, or object; second: keyframes; third: options.
- Sequences are arrays of segments; use `at` for absolute/relative timing.
- Use `createScopedAnimate` for scoped or reduced-motion animations.

<!--
Source references:
- https://motion.dev/docs/quick-start
- packages/framer-motion/src/animation/animate/index.ts
- packages/framer-motion/src/animation/sequence/
-->
