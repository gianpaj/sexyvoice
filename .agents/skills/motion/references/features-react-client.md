---
name: features-react-client
description: motion/client for Next.js App Router and "use client"
---

# motion/client

For Next.js App Router and other React 18+ setups using `"use client"`, import from `motion/client` to get individual components. This enables better tree-shaking and ensures client-only code stays in client bundles.

## Usage

### Next.js App Router

Import individual components from `motion/client` for client-only bundles:

```tsx
"use client"

import { div } from "motion/client"

export default function Page() {
  return (
    <div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      Animated content
    </div>
  )
}
```

### Individual Components

Import only the elements you need for better tree-shaking:

```tsx
"use client"

import { div, span, button } from "motion/client"

export default function Component() {
  return (
    <div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <span>Text</span>
      <button whileHover={{ scale: 1.05 }}>Click</button>
    </div>
  )
}
```

### With motion/react for Full API

For `motion`, `m`, `LazyMotion`, and other React-specific APIs, use `motion/react` (also works in "use client"):

```tsx
"use client"

import { motion, LazyMotion, domAnimation } from "motion/react"

export default function App() {
  return (
    <LazyMotion features={domAnimation}>
      <motion.div animate={{ x: 100 }} />
    </LazyMotion>
  )
}
```

## When to Use

- **Next.js App Router**: Use `motion/client` in Client Components to avoid shipping server-incompatible code
- **RSC boundaries**: Keeps animation logic in client bundle
- **Tree-shaking**: Import only the components you use (e.g. `div`, `span`)

## Key Points

- Import from `motion/client` for client-only usage
- Use `motion/react` for non-Next.js or when "use client" is not required
- Exports all HTML/SVG elements as motion components (`div`, `span`, `svg`, `path`, etc.)
- Same API as `motion/react`; only the entry point differs
- Pair with `LazyMotion` for code-split animations

<!--
Source references:
- packages/motion/src/react-client.ts
- packages/framer-motion/client.ts
- https://motion.dev/docs/react-quick-start#nextjs
-->
