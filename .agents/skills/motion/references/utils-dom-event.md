---
name: utils-dom-event
description: Attach DOM event listeners with useDomEvent
---

# useDomEvent

`useDomEvent` attaches event listeners directly to a DOM element via a ref. Use when you need non-passive handlers, window/document events, or to bypass React's event system.

## Usage

### Basic Usage

```jsx
import { useDomEvent } from "motion/react"

function Component() {
  const ref = useRef(null)

  useDomEvent(ref, "wheel", (e) => {
    e.preventDefault()
  }, { passive: false })

  return <div ref={ref}>Scroll area</div>
}
```

### Window Events

```jsx
const windowRef = useRef(typeof window !== "undefined" ? window : null)

useDomEvent(windowRef, "resize", () => {
  console.log("Window resized")
})
```

### Options

Pass options as the fourth argument (same as `addEventListener`):

```jsx
useDomEvent(ref, "scroll", onScroll, {
  passive: true,
  capture: false,
})
```

### Cleanup

The hook returns the cleanup function; listeners are removed when the component unmounts or when ref/handler/options change.

## When to Use

- **Non-passive handlers**: e.g. `wheel` with `passive: false` to call `preventDefault`
- **Window/document events**: resize, scroll, keydown on document
- **Events not in React's synthetic system**: When React's events don't fit

## Key Points

- Requires a ref to the target element (or window/document)
- Handler and options changes cause resubscription
- Uses `addDomEvent` from motion-dom under the hood
- Returns cleanup on unmount

<!--
Source references:
- packages/framer-motion/src/events/use-dom-event.ts
- packages/motion-dom/src/events/add-dom-event
-->
