---
name: gestures-tap-press
description: Tap and press gesture handlers
---

# Tap & Press Gestures

Tap and press gestures detect pointer interactions. Tap is a quick press, while press detects longer holds.

## Usage

### Tap

```jsx
import { motion } from "motion/react"

<motion.div
  onTap={(event, info) => {
    console.log("Tapped")
  }}
/>
```

### Press

```jsx
<motion.div
  onPress={(event, info) => {
    console.log("Pressed")
  }}
  onPressStart={(event, info) => {
    console.log("Press started")
  }}
  onPressEnd={(event, info) => {
    console.log("Press ended")
  }}
/>
```

### While Tap

Animate during tap:

```jsx
<motion.div
  whileTap={{ scale: 0.9 }}
/>
```

### Tap Cancel

Handle tap cancellation:

```jsx
<motion.div
  onTapCancel={(event, info) => {
    console.log("Tap cancelled")
  }}
/>
```

### Press Threshold

Customize press detection:

```jsx
<motion.div
  onPress={(event, info) => {
    // Only fires after threshold
  }}
  style={{ touchAction: "none" }}
/>
```

## Key Points

- `onTap` fires on quick press
- `onPress` fires on longer hold
- `whileTap` animates during tap
- Use `onTapCancel` for cancelled taps
- Press has start/end lifecycle
- Works with mouse and touch
- Combine with `whileTap` for visual feedback

<!--
Source references:
- https://motion.dev/docs/react/gestures
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/gestures/press.ts
-->
