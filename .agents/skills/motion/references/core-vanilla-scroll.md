---
name: core-vanilla-scroll
description: Imperative scroll() API for vanilla JavaScript
---

# scroll (Vanilla JS)

The `scroll()` function creates scroll-linked callbacks for vanilla JavaScript. Use when not using React or when you need imperative control over scroll tracking.

## Usage

### Basic Scroll Tracking

```js
import { scroll } from "motion/react"

const stop = scroll(
  (progress) => {
    console.log("Scroll progress:", progress)
  },
  { axis: "y" }
)

// Stop observing when done
stop()
```

### With Scroll Info

Get detailed scroll data (position, progress, velocity):

```js
import { scroll } from "motion/react"

scroll(
  (progress, info) => {
    const { x, y } = info
    console.log("Y progress:", y.progress)
    console.log("Y position:", y.current)
    console.log("Y velocity:", y.velocity)
  },
  { axis: "y" }
)
```

### Container Scroll

Track scroll within a specific element:

```js
const container = document.querySelector(".scroll-container")

scroll(
  (progress) => {
    document.body.style.setProperty("--scroll", progress)
  },
  {
    container,
    axis: "y",
  }
)
```

### Target Element

Track when a target element scrolls into view:

```js
const target = document.querySelector("#section")

scroll(
  (progress, info) => {
    // progress: 0 when target enters, 1 when it leaves
    element.style.opacity = progress
  },
  {
    target,
    offset: ["start end", "end start"],
  }
)
```

### scrollInfo

For full scroll info (position, progress, velocity per axis) instead of just progress:

```js
import { scrollInfo } from "motion/react"

const stop = scrollInfo(
  (info) => {
    const { x, y } = info
    console.log("Y:", y.current, y.progress, y.velocity)
  },
  { container: element, axis: "y" }
)

stop()  // Unsubscribe
```

Use `scrollInfo` when you need detailed axis data; use `scroll` for progress-based callbacks.

## Options

| Option | Type | Description |
|--------|------|-------------|
| `container` | Element | Scroll container (default: document.scrollingElement) |
| `target` | Element | Element to track in view |
| `axis` | `"x" \| "y"` | Scroll axis |
| `offset` | ScrollOffset | When animation starts/ends (e.g. `["start end", "end start"]`) |

## Key Points

- Returns a function to stop observing
- Use `scroll()` for continuous tracking, `scrollInfo()` for one-off reads
- Works with `animate()` for scroll-driven animations in vanilla JS
- Same offset format as `useScroll` (e.g. `["start start", "end end"]`)
- Import from `motion/react` (or `motion` for dom entry)

<!--
Source references:
- packages/framer-motion/src/render/dom/scroll/index.ts
- packages/framer-motion/src/render/dom/scroll/types.ts
- packages/framer-motion/dom.ts
-->
