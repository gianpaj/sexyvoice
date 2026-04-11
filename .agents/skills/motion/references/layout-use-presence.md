---
name: layout-use-presence
description: usePresence and useIsPresent for AnimatePresence children
---

# usePresence & useIsPresent

When a component is a child of `AnimatePresence`, use `usePresence` or `useIsPresent` to access presence state. Use for custom exit logic, delaying DOM removal, or coordinating with external state.

## Usage

### usePresence

Returns `[isPresent, safeToRemove]`:

```jsx
import { AnimatePresence, motion, usePresence } from "motion/react"

function Item({ id }) {
  const [isPresent, safeToRemove] = usePresence()

  useEffect(() => {
    if (!isPresent) {
      // Component is exiting - run cleanup or delay removal
      const timer = setTimeout(safeToRemove, 500)
      return () => clearTimeout(timer)
    }
  }, [isPresent, safeToRemove])

  return (
    <motion.div
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      Item {id}
    </motion.div>
  )
}

function List({ items }) {
  return (
    <AnimatePresence>
      {items.map((item) => (
        <Item key={item.id} id={item.id} />
      ))}
    </AnimatePresence>
  )
}
```

- `isPresent`: `true` when mounted or entering; `false` when removed from tree (exiting)
- `safeToRemove`: Call when the component is ready to be unmounted. AnimatePresence waits for this before removing from DOM.

### useIsPresent

Simpler hook that only returns whether the component is present:

```jsx
import { useIsPresent } from "motion/react"

function Component() {
  const isPresent = useIsPresent()

  useEffect(() => {
    if (!isPresent) {
      console.log("Component removed from tree")
    }
  }, [isPresent])

  return <motion.div>Content</motion.div>
}
```

### subscribe Parameter

`usePresence(subscribe)` — when `false`, the component does not register for exit completion. Use when you don't need `safeToRemove`:

```jsx
const [isPresent] = usePresence(false)
```

## When to Use

- **Custom exit logic**: Run async cleanup, analytics, or coordination before unmount
- **Delayed removal**: Call `safeToRemove` after a timeout or external event
- **Conditional behavior**: Use `isPresent` to change behavior during exit
- **No custom removal**: Use `useIsPresent` when you only need to know presence; AnimatePresence handles removal via `exit` animation

## Key Points

- Only works inside `AnimatePresence`
- Outside AnimatePresence, `usePresence` returns `[true, null]`, `useIsPresent` returns `true`
- Must call `safeToRemove` when `isPresent` is false if you need to control when DOM removal happens
- If you never call `safeToRemove`, the exiting component stays in the DOM
- Use with `propagate` for nested AnimatePresence

<!--
Source references:
- packages/framer-motion/src/components/AnimatePresence/use-presence.ts
- packages/framer-motion/src/components/AnimatePresence/index.tsx
-->
