---
name: layout-instant-transition
description: useInstantLayoutTransition for blocking layout updates
---

# useInstantLayoutTransition

`useInstantLayoutTransition` returns a function that, when called, blocks the next layout animation update and optionally runs a callback. Use when you need to change layout (e.g. DOM removal or reorder) without triggering a layout animation—similar to pausing the projection tree for one frame.

## Usage

### Block Update and Run Callback

```jsx
import { useInstantLayoutTransition } from "motion/react"

function Component() {
  const instantTransition = useInstantLayoutTransition()

  const handleRemove = () => {
    instantTransition(() => {
      // DOM changes here won’t trigger layout animation
      removeItemFromList()
    })
  }

  return (
    <Reorder.Group>
      {items.map(...)}
    </Reorder.Group>
  )
}
```

### Without Callback

```jsx
const instantTransition = useInstantLayoutTransition()

// Later: block the next layout update
instantTransition()
```

Used internally when you need to apply layout changes without FLIP.

## Key Points

- Returns a function `(callback?: () => void) => void`.
- Sets projection tree to “not updating” and runs callback; next layout update is blocked.
- Useful with Reorder or manual layout changes where you want an instant snap.
- No-op if there is no root projection node (e.g. outside layout context).

<!--
Source references:
- packages/framer-motion/src/projection/use-instant-layout-transition.ts
- motion-dom rootProjectionNode
-->
