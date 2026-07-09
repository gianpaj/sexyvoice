---
name: core-motion-mini
description: motion/mini and useAnimateMini for minimal bundle
---

# motion/mini

The `motion/mini` entry point provides a minimal API for smallest bundle size: `useAnimate` (via `useAnimateMini`) and WAAPI-based animations only. Use when you need only imperative animations without gestures, layout, or motion components.

## Usage

### Import motion/mini

```jsx
import { useAnimate } from "motion/mini"
```

Or from the motion package:

```jsx
import { useAnimate } from "motion/dom/mini"
```

### useAnimate (Mini)

Returns `[scopeRef, animate]` — same as full `useAnimate` but uses WAAPI only:

```jsx
import { useAnimate } from "motion/mini"

function Component() {
  const [scope, animate] = useAnimate()

  const runAnimation = () => {
    animate(scope.current, { x: 100 }, { duration: 0.5 })
  }

  return <div ref={scope} onClick={runAnimation}>Animate</div>
}
```

## What's Included

- `useAnimate` (mini) — imperative animation with WAAPI
- No motion components, gestures, layout, or MotionValues
- Smallest possible Motion footprint

## Key Points

- Use `motion/mini` for minimal bundle when you only need imperative animations
- WAAPI (Web Animations API) only — no JavaScript animation fallback
- Same `animate()` API as full Motion
- No `motion.div`, `useMotionValue`, gestures, or layout animations

<!--
Source references:
- packages/framer-motion/src/mini.ts
- packages/motion/src/mini.ts
- packages/framer-motion/src/animation/hooks/use-animate-style.ts
-->
