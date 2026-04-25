---
name: features-in-view
description: Viewport visibility with useInView, inView(), and usePageInView
---

# In View

Motion provides viewport-based visibility: React hook `useInView`, imperative `inView()`, and page visibility `usePageInView`.

## Usage

### useInView (React)

Returns a boolean that is true when the element is in view:

```jsx
import { useInView } from "motion/react"

function Component() {
  const ref = useRef(null)
  const isInView = useInView(ref, {
    once: true,
    amount: 0.5,
    margin: "100px",
    initial: false,
  })

  return (
    <motion.div
      ref={ref}
      animate={{ opacity: isInView ? 1 : 0 }}
    />
  )
}
```

Options:
- `once` – only trigger once when entering (default `false`).
- `amount` – `"some"` (any part), `"all"`, or `0`–`1` (ratio in view).
- `margin` – root margin string (e.g. `"50px"`, `"0px 0px -100px 0px"`).
- `root` – ref to scroll container (default viewport).
- `initial` – initial state before first intersection.

### inView() (Imperative)

Observe elements and run a callback when they enter (and optionally leave). Returns an unsubscribe function.

```js
import { inView } from "motion/react"

const stop = inView(
  ".animate-on-scroll",
  (element, entry) => {
    // element entered view
    return (entry) => {
      // optional: cleanup when leaving
    }
  },
  { root: document.getElementById("scroll"), amount: "all" }
)

// later: stop()
```

Use when you need imperative control or non-React code.

### usePageInView (React)

Returns whether the page is visible (document not hidden). Uses `document.visibilityState` / `visibilitychange`:

```jsx
import { usePageInView } from "motion/react"

function Component() {
  const isPageVisible = usePageInView()

  return (
    <motion.div
      animate={{ opacity: isPageVisible ? 1 : 0.5 }}
    />
  )
}
```

Use for pausing or dimming when the tab is in the background.

## Key Points

- `useInView(ref, options)` – React hook, returns boolean.
- `inView(selector, onStart, options)` – imperative, returns cleanup.
- `usePageInView()` – page visibility (tab focused).
- `amount` and `margin` map to IntersectionObserver.

<!--
Source references:
- packages/framer-motion/src/utils/use-in-view.ts
- packages/framer-motion/src/render/dom/viewport/index.ts
- packages/framer-motion/src/utils/use-page-in-view.ts
-->
