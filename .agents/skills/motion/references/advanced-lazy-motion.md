---
name: advanced-lazy-motion
description: Code-split animations for better performance
---

# LazyMotion

`LazyMotion` enables code-splitting for Motion features, reducing initial bundle size by loading animation features on demand.

## Usage

### Basic LazyMotion

```jsx
import { LazyMotion, m, domAnimation } from "motion/react"

function App() {
  return (
    <LazyMotion features={domAnimation}>
      <m.div animate={{ x: 100 }} />
    </LazyMotion>
  )
}
```

### Feature Sets

```jsx
// Minimal features
import { domMin } from "motion/react"
<LazyMotion features={domMin}>

// Animation features
import { domAnimation } from "motion/react"
<LazyMotion features={domAnimation}>

// Maximum features (gestures, layout, etc.)
import { domMax } from "motion/react"
<LazyMotion features={domMax}>
```

### Strict Mode

```jsx
<LazyMotion features={domAnimation} strict>
  {/* Features must be loaded before use */}
</LazyMotion>
```

## Feature Sets

- `domMin` - Minimal features, smallest bundle
- `domAnimation` - Animation features
- `domMax` - All features including gestures and layout

## Key Points

- `LazyMotion` code-splits Motion features
- Wrap app or components with LazyMotion
- Use `m` component with LazyMotion
- Choose feature set based on needs
- Reduces initial bundle size
- Features load asynchronously
- `strict` mode ensures features loaded

<!--
Source references:
- https://motion.dev/docs/react/lazy-motion
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/components/LazyMotion
-->
