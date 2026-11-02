---
name: layout-presence-data
description: usePresenceData for AnimatePresence custom prop
---

# usePresenceData

`usePresenceData` returns the `custom` value passed to the nearest `AnimatePresence`. Use when a descendant needs to read `AnimatePresence`'s `custom` prop (e.g. for dynamic exit variants) without prop drilling.

## Usage

### Basic Usage

```jsx
import { AnimatePresence, motion, usePresenceData } from "motion/react"

function Child() {
  const customData = usePresenceData()
  // customData === value passed to AnimatePresence's custom prop

  return (
    <motion.div
      exit={(data) => ({ opacity: 0, x: data > 0.5 ? 100 : -100 })}
      custom={customData}
    >
      Content
    </motion.div>
  )
}

function Parent({ isVisible }) {
  return (
    <AnimatePresence custom={0.8}>
      {isVisible && <Child />}
    </AnimatePresence>
  )
}
```

### With usePresence

```jsx
function Child() {
  const [isPresent, safeToRemove] = usePresence()
  const data = usePresenceData()

  return (
    <div style={{ opacity: isPresent ? data / 2 : data }}>
      Content
    </div>
  )
}
```

### Outside AnimatePresence

Returns `undefined` when not inside `AnimatePresence`:

```jsx
function Component() {
  const data = usePresenceData()
  // data === undefined when not in AnimatePresence
  return <div />
}
```

## Key Points

- Returns `AnimatePresence`'s `custom` prop value
- Returns `undefined` when not inside AnimatePresence
- Use with `custom` prop on `motion` components for dynamic variants
- Avoids prop drilling when deep children need `custom` data

<!--
Source references:
- packages/framer-motion/src/components/AnimatePresence/use-presence-data.ts
-->
