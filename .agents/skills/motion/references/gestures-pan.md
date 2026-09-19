---
name: gestures-pan
description: Pan gestures for touch and pointer events
---

# Pan Gestures

Pan gestures detect directional movement. Unlike drag, pan doesn't move the element but detects panning motion for custom interactions.

## Usage

### Basic Pan

```jsx
import { motion } from "motion/react"

<motion.div
  onPan={(event, info) => {
    console.log("Panning:", info.delta)
  }}
/>
```

### Pan Directions

Detect pan direction:

```jsx
<motion.div
  onPanStart={(event, info) => {
    console.log("Pan started:", info.offset)
  }}
  onPan={(event, info) => {
    console.log("Panning:", info.delta, info.offset)
  }}
  onPanEnd={(event, info) => {
    console.log("Pan ended:", info.velocity)
  }}
/>
```

### Pan Axis

Constrain to specific axis:

```jsx
<motion.div
  onPan={(event, info) => {
    // Only fires for horizontal pan
  }}
  style={{ touchAction: "pan-y" }}  // Prevent vertical pan
/>
```

## Pan Info

The `info` object contains:

- `delta` - Change since last event
- `offset` - Total offset from start
- `velocity` - Current velocity
- `point` - Current point coordinates

## Key Points

- Pan detects directional movement
- Use for custom pan interactions
- `onPanStart`, `onPan`, `onPanEnd` handlers
- Info object provides delta, offset, velocity
- Use `touchAction` CSS to constrain axes
- Works with touch and pointer events

<!--
Source references:
- https://motion.dev/docs/react/gestures
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/gestures/pan
-->
