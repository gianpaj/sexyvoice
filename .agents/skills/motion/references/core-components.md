---
name: core-components
description: Motion components for React - motion.div, motion.svg, and other HTML/SVG elements
---

# Motion Components

Motion provides animated versions of HTML and SVG elements through the `motion` namespace. These components accept all standard HTML/SVG props plus Motion-specific animation props.

## Usage

Import `motion` from `motion/react`:

```jsx
import { motion } from "motion/react"

function Component() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      Animated content
    </motion.div>
  )
}
```

## Available Components

All HTML and SVG elements are available as motion components:

```jsx
// HTML elements
<motion.div />
<motion.span />
<motion.button />
<motion.input />
<motion.section />
// ... all HTML elements

// SVG elements
<motion.svg />
<motion.circle />
<motion.path />
<motion.rect />
// ... all SVG elements
```

## Minimal Component (m)

For smaller bundle sizes, use `m` instead of `motion`:

```jsx
import { m } from "motion/react"

function Component() {
  return <m.div animate={{ x: 100 }} />
}
```

The `m` component has fewer features but is more lightweight. Use `motion` for full feature set.

## Custom Components

Wrap custom React components with `motion()`:

```jsx
import { motion } from "motion/react"

const CustomComponent = ({ children }) => <div>{children}</div>

const MotionCustom = motion(CustomComponent)

function App() {
  return (
    <MotionCustom animate={{ scale: 1.2 }}>
      Custom animated component
    </MotionCustom>
  )
}
```

## Key Points

- Motion components accept all standard HTML/SVG props
- Use `motion` for full features, `m` for minimal bundle
- Custom components can be wrapped with `motion()`
- Motion props (`animate`, `initial`, etc.) work alongside standard props
- Style prop supports MotionValues and transform shortcuts (x, y, scale, rotate)

<!--
Source references:
- https://motion.dev/docs/react
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/render/components/motion
-->
