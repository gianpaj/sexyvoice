---
name: layout-reset-projection
description: useResetProjection to reset layout projection tree
---

# useResetProjection

`useResetProjection` returns a function that resets the layout projection tree. Call it when the layout structure has changed in a way that makes cached layout data invalid (e.g. after large DOM changes or route changes).

## Usage

### After Structural Change

```jsx
import { useResetProjection } from "motion/react"

function Page() {
  const resetProjection = useResetProjection()

  useEffect(() => {
    // After route change or major DOM update
    resetProjection()
  }, [pathname])

  return (
    <LayoutGroup>
      <motion.div layoutId="header">...</motion.div>
    </LayoutGroup>
  )
}
```

### With Reorder / List Changes

When you replace the list entirely (not just reorder), reset so new layoutIds get correct measurements:

```jsx
const resetProjection = useResetProjection()

const setItems = (newItems) => {
  setItemsState(newItems)
  resetProjection()
}
```

## Key Points

- Returns a stable callback that calls `rootProjectionNode.current.resetTree()`.
- Use after layout structure or layoutId usage changes so projection doesn’t use stale layout.
- Safe to call when root is null (no-op).
- Typically used with LayoutGroup / layoutId / Reorder.

<!--
Source references:
- packages/framer-motion/src/projection/use-reset-projection.ts
- motion-dom projection node system
-->
