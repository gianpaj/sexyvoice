---
name: core-variants
description: Declarative animation variants for reusable animation states
---

# Variants

Variants are named animation states that can be reused across components. They enable declarative animation orchestration and make complex animations easier to manage.

## Usage

### Basic Variants

Define variants as an object and reference them by name:

```jsx
import { motion } from "motion/react"

const variants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0 }
}

function Component() {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={variants}
    >
      Content
    </motion.div>
  )
}
```

### Variant Orchestration

Variants can orchestrate child animations:

```jsx
const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const item = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1 }
}

function List() {
  return (
    <motion.ul
      initial="hidden"
      animate="visible"
      variants={container}
    >
      <motion.li variants={item}>Item 1</motion.li>
      <motion.li variants={item}>Item 2</motion.li>
      <motion.li variants={item}>Item 3</motion.li>
    </motion.ul>
  )
}
```

### Dynamic Variants

Variants can be functions that accept custom props:

```jsx
const variants = {
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1
    }
  }),
  hidden: { opacity: 0, y: -20 }
}

function Item({ i }) {
  return (
    <motion.div
      custom={i}
      initial="hidden"
      animate="visible"
      variants={variants}
    />
  )
}
```

### Variant Labels

Reference variants by string or array of strings:

```jsx
<motion.div
  animate={["visible", "active"]}
  variants={{
    visible: { opacity: 1 },
    active: { scale: 1.1 }
  }}
/>
```

## Key Points

- Variants enable reusable animation states
- Use `variants` prop to define, `initial`/`animate` to reference
- Child variants inherit parent variant state
- `staggerChildren` orchestrates child animations
- Variants can be functions accepting `custom` prop
- Multiple variant labels can be applied simultaneously

<!--
Source references:
- https://motion.dev/docs/react/variants
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/motion
-->
