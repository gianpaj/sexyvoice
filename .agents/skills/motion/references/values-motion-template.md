---
name: values-motion-template
description: Combine motion values into a string with useMotionTemplate
---

# useMotionTemplate

`useMotionTemplate` creates a MotionValue from a template literal that includes other MotionValues. The output updates whenever any of the source values change. Use for CSS values that are built from multiple motion values (e.g. `filter`, `boxShadow`, `transform` strings).

## Usage

### Template with MotionValues

```jsx
import { motion, useMotionValue, useSpring, useMotionTemplate } from "motion/react"

function Component() {
  const x = useSpring(0)
  const y = useMotionValue(0)
  const shadow = useMotionTemplate`drop-shadow(${x}px ${y}px 20px rgba(0,0,0,0.3))`

  return <motion.div style={{ filter: shadow }} />
}
```

### Box Shadow

```jsx
const offsetX = useMotionValue(0)
const offsetY = useMotionValue(0)
const blur = useMotionValue(10)
const shadow = useMotionTemplate`${offsetX}px ${offsetY}px ${blur}px rgba(0,0,0,0.2)`

return <motion.div style={{ boxShadow: shadow }} />
```

### Transform String

```jsx
const rotate = useMotionValue(0)
const scale = useMotionValue(1)
const transform = useMotionTemplate`rotate(${rotate}deg) scale(${scale})`

return <motion.div style={{ transform }} />
```

## Key Points

- Tagged template: `` useMotionTemplate`...${motionValue}...` ``.
- Fragments are static strings; interpolated values can be MotionValue, number, or string.
- Result is a MotionValue&lt;string&gt;; use in `style` or pass to other APIs.
- Only MotionValues in the template trigger updates; static values do not.

<!--
Source references:
- packages/framer-motion/src/value/use-motion-template.ts
-->
