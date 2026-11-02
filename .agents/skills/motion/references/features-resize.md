---
name: features-resize
description: resize() observer for window or element size changes
---

# Resize

Motion’s `resize` function subscribes to size changes of the window or a specific element. It uses ResizeObserver when available. Use for layout-dependent logic or animations (e.g. recalculating on container size change).

## Usage

### Window Resize

```js
import { resize } from "motion/react"

const stop = resize((info) => {
  // info: { width, height }
  console.log(info.width, info.height)
})

// cleanup
stop()
```

### Element Resize

```js
import { resize } from "motion/react"

const stop = resize("#sidebar", (element, info) => {
  // element: the observed element
  // info: { width, height }
  updateLayout(info.width)
})

stop()
```

With selector or ref (vanilla):

```js
resize(document.querySelector(".panel"), (el, { width, height }) => {
  animate(el, { scale: width > 400 ? 1 : 0.9 })
})
```

### Return Value

Both overloads return a function that unsubscribes (stops observing). Call it in React `useEffect` cleanup or when tearing down.

## Key Points

- `resize(callback)` – observe window; callback receives `{ width, height }`.
- `resize(elementOrSelector, callback)` – observe element; callback receives `(element, { width, height })`.
- Returns unsubscribe function.
- Use for layout-driven animations or non-React resize logic; in React, ResizeObserver + state is an alternative.

<!--
Source references:
- packages/motion-dom/src/resize/index.ts
- packages/motion-dom/src/resize/types.ts
-->
