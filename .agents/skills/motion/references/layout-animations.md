---
name: layout-animations
description: Automatic layout animations with layoutId
---

# Layout Animations

Layout animations automatically animate components when their layout changes. Use `layout` prop or `layoutId` for shared element transitions.

## Usage

### Basic Layout Animation

```jsx
import { motion } from "motion/react"

<motion.div layout>
  {/* Automatically animates when layout changes */}
</motion.div>
```

### Layout ID

Share layout between components:

```jsx
function Component({ selectedId }) {
  return (
    <>
      {items.map(item => (
        <motion.div
          key={item.id}
          layoutId={item.id}
          animate={selectedId === item.id ? "selected" : "normal"}
        />
      ))}
    </>
  )
}
```

### Layout Transition

Customize layout transition:

```jsx
<motion.div
  layout
  transition={{
    layout: { duration: 0.3, ease: "easeOut" }
  }}
/>
```

### Layout Root

Animate from a specific root:

```jsx
<LayoutGroup>
  <motion.div layoutRoot>
    {/* Layout animations relative to this */}
  </motion.div>
</LayoutGroup>
```

## Key Points

- `layout` enables automatic layout animation
- `layoutId` creates shared element transitions
- Animates position, size, and rotation changes
- Use `LayoutGroup` to coordinate animations
- Layout transitions are optimized for performance
- Works with drag and other interactions
- Spring transitions recommended for layout

<!--
Source references:
- https://motion.dev/docs/react/layout-animations
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/projection
-->
