---
name: best-practices-bundle
description: Bundle size optimization strategies
---

# Bundle Size Best Practices

Minimize Motion's impact on bundle size by choosing the right entry point and features.

## Entry Points

| Entry | Use Case | Size |
|-------|----------|------|
| `motion/react` | Full React API | Largest |
| `motion/client` | Next.js "use client", tree-shaking | Same API, client-only |
| `motion/mini` | Imperative animations only | Smallest |
| `motion` (dom) | Vanilla JS | Medium |

## Strategies

### 1. Use `m` Instead of `motion`

```jsx
import { m } from "motion/react"
<m.div animate={{ x: 100 }} />
```

### 2. LazyMotion + domAnimation

```jsx
import { LazyMotion, domAnimation, m } from "motion/react"

<LazyMotion features={domAnimation}>
  <m.div animate={{ x: 100 }} />
</LazyMotion>
```

Loads features on demand. Use `domMin` for minimal, `domMax` for all.

### 3. motion/client for Next.js

Import individual components to enable tree-shaking:

```jsx
"use client"
import { div } from "motion/client"
<div animate={{ opacity: 1 }} />
```

### 4. motion/mini for Imperative Only

When you only need `useAnimate`:

```jsx
import { useAnimate } from "motion/mini"
```

### 5. Vanilla JS

Use `motion` (dom) or `motion/react` for `animate()`, `scroll()`, `inView()` without React components.

## Key Points

- Prefer `m` over `motion` for components
- Use LazyMotion with the smallest feature set you need
- Import from `motion/client` in Next.js Client Components
- Use `motion/mini` when only imperative animations are needed

<!--
Source references:
- packages/motion/src/
- advanced-lazy-motion.md
-->
