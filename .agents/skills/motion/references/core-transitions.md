---
name: core-transitions
description: Animation timing, easing, and spring physics configuration
---

# Transitions

Transitions control how animations are performed - their duration, easing, and physics properties.

## Usage

### Basic Transition

```jsx
import { motion } from "motion/react"

<motion.div
  animate={{ x: 100 }}
  transition={{ duration: 0.5, ease: "easeOut" }}
/>
```

### Per-Property Transitions

Different transitions for different properties:

```jsx
<motion.div
  animate={{ x: 100, opacity: 0.5 }}
  transition={{
    x: { duration: 0.8, ease: "easeInOut" },
    opacity: { duration: 0.2 }
  }}
/>
```

### Spring Physics

Use spring animations for natural motion:

```jsx
<motion.div
  animate={{ scale: 1.2 }}
  transition={{
    type: "spring",
    stiffness: 300,
    damping: 30
  }}
/>
```

### Easing Functions

Predefined easing or custom cubic bezier:

```jsx
// Predefined
transition={{ ease: "easeIn", "easeOut", "easeInOut", "linear" }}

// Custom cubic bezier
transition={{ ease: [0.17, 0.67, 0.83, 0.67] }}

// Custom easing function
transition={{ ease: (t) => t * t }}
```

### Delay and Repeat

```jsx
<motion.div
  animate={{ rotate: 360 }}
  transition={{
    delay: 0.5,
    repeat: Infinity,
    repeatType: "loop",
    duration: 2
  }}
/>
```

## Transition Types

### Tween

Smooth interpolation between values:

```jsx
transition={{
  type: "tween",
  duration: 0.5,
  ease: "easeOut"
}}
```

### Spring

Physics-based animation:

```jsx
transition={{
  type: "spring",
  stiffness: 100,    // Spring stiffness
  damping: 10,        // Spring damping
  mass: 1,            // Spring mass
  velocity: 0         // Initial velocity
}}
```

### Inertia

Momentum-based animation:

```jsx
transition={{
  type: "inertia",
  velocity: 100,
  power: 0.3,
  timeConstant: 200
}}
```

## Key Points

- `duration` controls animation length (seconds)
- `ease` controls acceleration curve
- `spring` type uses physics for natural motion
- `delay` delays animation start
- `repeat` repeats animation (Infinity for loop)
- Per-property transitions override global transition
- `staggerChildren` in variants creates sequential child animations

<!--
Source references:
- https://motion.dev/docs/react/transition
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/animation
-->
