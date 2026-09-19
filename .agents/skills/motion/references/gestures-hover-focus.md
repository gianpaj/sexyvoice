---
name: gestures-hover-focus
description: Hover and focus state animations
---

# Hover & Focus

Animate components on hover and focus states. These are common interaction patterns for buttons, links, and interactive elements.

## Usage

### While Hover

```jsx
import { motion } from "motion/react"

<motion.div
  whileHover={{ scale: 1.1, backgroundColor: "#f0f0f0" }}
/>
```

### While Focus

```jsx
<motion.div
  whileFocus={{ scale: 1.05, outline: "2px solid blue" }}
/>
```

### Hover Handlers

```jsx
<motion.div
  onHoverStart={(event) => {
    console.log("Hover started")
  }}
  onHoverEnd={(event) => {
    console.log("Hover ended")
  }}
/>
```

### Focus Handlers

```jsx
<motion.input
  onFocus={(event) => {
    console.log("Focused")
  }}
  onBlur={(event) => {
    console.log("Blurred")
  }}
/>
```

### Combined States

```jsx
<motion.button
  whileHover={{ scale: 1.05 }}
  whileFocus={{ scale: 1.05, boxShadow: "0 0 0 2px blue" }}
  whileTap={{ scale: 0.95 }}
/>
```

## Key Points

- `whileHover` animates on hover
- `whileFocus` animates on focus
- Use for interactive element feedback
- Handlers provide event objects
- Works with all interactive elements
- Combine with tap for complete interactions
- Focus animations improve accessibility

<!--
Source references:
- https://motion.dev/docs/react/gestures
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/gestures/hover.ts
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/gestures/focus.ts
-->
