---
name: advanced-animation-controls
description: Programmatic animation control with useAnimation
---

# Animation Controls

Control animations programmatically using `useAnimation` or `animationControls`. Useful for triggering animations from external events or coordinating multiple animations.

## Usage

### useAnimation

```jsx
import { motion, useAnimation } from "motion/react"

function Component() {
  const controls = useAnimation()

  const handleClick = async () => {
    await controls.start({ x: 100 })
    await controls.start({ x: 0 })
  }

  return (
    <motion.div
      animate={controls}
      onClick={handleClick}
    />
  )
}
```

### animationControls

Create controls outside component:

```jsx
import { motion, animationControls } from "motion/react"

const controls = animationControls()

function Component() {
  return (
    <motion.div animate={controls} />
  )
}

// Control from anywhere
controls.start({ scale: 1.5 })
```

### Sequence Animations

```jsx
const controls = useAnimation()

const sequence = async () => {
  await controls.start({ x: 100 })
  await controls.start({ y: 100 })
  await controls.start({ x: 0, y: 0 })
}

sequence()
```

### Variant Controls

Control variants programmatically:

```jsx
const controls = useAnimation()

const variants = {
  visible: { opacity: 1 },
  hidden: { opacity: 0 }
}

<motion.div
  variants={variants}
  animate={controls}
/>

// Start variant
controls.start("visible")
```

### Stop and Set

```jsx
controls.stop()  // Stop current animation
controls.set({ x: 100 })  // Set immediately without animation
```

## Key Points

- `useAnimation` creates animation controls
- `animationControls()` creates standalone controls
- Controls can start, stop, and set animations
- Use `await` for sequential animations
- Controls work with variants
- Can control multiple components
- Useful for complex animation sequences

<!--
Source references:
- https://motion.dev/docs/react/animation-controls
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/animation/hooks/use-animation.tsx
-->
