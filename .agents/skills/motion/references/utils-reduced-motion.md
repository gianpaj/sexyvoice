---
name: utils-reduced-motion
description: useReducedMotion and useReducedMotionConfig hooks for accessibility
---

# Reduced Motion Hooks

Motion provides hooks to read the current reduced-motion state. Use them to conditionally simplify or skip animations when the user prefers reduced motion.

## Usage

### useReducedMotion

Returns a boolean: `true` when the user prefers reduced motion (or when overridden by `MotionConfig`).

```jsx
import { useReducedMotion } from "motion/react"

function Component() {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      animate={{ x: shouldReduceMotion ? 0 : 100 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.5 }}
    />
  )
}
```

Respects:
- `prefers-reduced-motion: reduce` (system/OS)
- `MotionConfig reducedMotion="user" | "always" | "never"`

### useReducedMotionConfig

Returns the resolved reduced-motion config object (e.g. for custom transition overrides):

```jsx
import { useReducedMotionConfig } from "motion/react"

function Component() {
  const reducedMotionConfig = useReducedMotionConfig()
  // e.g. { duration: 0.01 } when reduced
  return (
    <motion.div
      transition={{
        ...defaultTransition,
        ...reducedMotionConfig,
      }}
    />
  )
}
```

Use when you need the actual transition values for reduced motion rather than just a boolean.

## Key Points

- `useReducedMotion()` → boolean; use to branch logic or disable animations.
- `useReducedMotionConfig()` → config object for transitions when reduced.
- Both respect MotionConfig and system preference.
- Prefer `MotionConfig reducedMotion="user"` for app-wide behavior when possible.

<!--
Source references:
- packages/framer-motion/src/utils/reduced-motion/
- MotionConfig in advanced-motion-config
-->
