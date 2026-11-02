---
name: layout-group
description: Coordinate layout animations across components
---

# LayoutGroup

`LayoutGroup` coordinates layout animations across multiple components. Components with the same `layoutId` within a group will animate between positions.

## Usage

### Basic Layout Group

```jsx
import { motion, LayoutGroup } from "motion/react"

function App() {
  return (
    <LayoutGroup>
      <Item id="1" />
      <Item id="2" />
    </LayoutGroup>
  )
}
```

### Shared Layout Animation

Animate between components with same `layoutId`:

```jsx
function Item({ id, isSelected }) {
  return (
    <>
      {isSelected && (
        <motion.div
          layoutId="selected"
          initial={false}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
    </>
  )
}
```

### Layout Animation

Enable automatic layout animations:

```jsx
<motion.div layout>
  {/* Animates when layout changes */}
</motion.div>
```

### Layout ID

Share layout between components:

```jsx
<motion.div layoutId="shared" />
<motion.div layoutId="shared" />  // Animates between these
```

### id and inherit

Use `id` to scope layout groups; `inherit` controls parent group/id inheritance:

```jsx
<LayoutGroup id="A">
  <LayoutGroup id="B" inherit="id">  {/* id becomes "A-B" */}
  <LayoutGroup inherit={false}>       {/* New isolated group */}
```

- `inherit={true}` — Inherit group and id (default)
- `inherit="id"` — Inherit id only, new group
- `inherit={false}` — Isolated group

## Key Points

- `LayoutGroup` coordinates layout animations
- `layoutId` shares layout between components
- `layout` prop enables automatic layout animation
- Components animate when layout changes
- Use for shared element transitions
- Works with AnimatePresence
- Spring transitions work best for layout

<!--
Source references:
- https://motion.dev/docs/react/layout-animations
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/components/LayoutGroup
-->
