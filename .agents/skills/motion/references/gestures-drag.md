---
name: gestures-drag
description: Drag gestures with constraints and controls
---

# Drag Gestures

Enable drag interactions on motion components. Drag can be constrained to specific axes, limited to specific areas, or controlled programmatically.

## Usage

### Basic Drag

```jsx
import { motion } from "motion/react"

<motion.div drag />
```

### Axis Constraints

Constrain drag to specific axes:

```jsx
<motion.div drag="x" />  // Horizontal only
<motion.div drag="y" />  // Vertical only
<motion.div drag />      // Both axes
```

### Drag Constraints

Limit drag to specific areas:

```jsx
<motion.div
  drag
  dragConstraints={{ left: 0, right: 300, top: 0, bottom: 300 }}
/>
```

### Drag Elastic

Add elastic resistance at constraints:

```jsx
<motion.div
  drag
  dragConstraints={{ left: 0, right: 300 }}
  dragElastic={0.2}  // 0 = no elastic, 1 = full elastic
/>
```

### Drag Momentum

Enable momentum-based drag:

```jsx
<motion.div
  drag
  dragMomentum={false}  // Disable momentum
/>
```

### Drag Controls

Control drag programmatically:

```jsx
import { useDragControls } from "motion/react"

function Component() {
  const controls = useDragControls()

  return (
    <>
      <button onPointerDown={(e) => controls.start(e)}>
        Start Drag
      </button>
      <motion.div drag dragControls={controls} />
    </>
  )
}
```

### Drag Event Handlers

```jsx
<motion.div
  drag
  onDrag={(event, info) => {
    console.log("Dragging:", info.point)
  }}
  onDragStart={(event, info) => {
    console.log("Drag started")
  }}
  onDragEnd={(event, info) => {
    console.log("Drag ended:", info.velocity)
  }}
/>
```

### Drag Direction Lock

Lock to initial drag direction:

```jsx
<motion.div
  drag
  dragDirectionLock
/>
```

## Key Points

- `drag` enables drag interaction
- Use `drag="x"` or `drag="y"` for axis constraints
- `dragConstraints` limits drag area
- `dragElastic` adds resistance at boundaries
- Use `useDragControls` for programmatic control
- Drag handlers receive event and info objects
- `dragDirectionLock` locks to initial direction
- Combine with layout animations for smooth interactions

<!--
Source references:
- https://motion.dev/docs/react/drag
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/gestures/drag
-->
