---
name: advanced-use-animate
description: Imperative animation API
---

# useAnimate

`useAnimate` provides an imperative API for animating elements directly. Returns a ref to attach to elements and an `animate` function for programmatic control.

## Usage

### Basic useAnimate

```jsx
import { useAnimate } from "motion/react"

function Component() {
  const [scope, animate] = useAnimate()

  const handleClick = () => {
    animate(scope.current, { x: 100, rotate: 180 })
  }

  return (
    <div ref={scope} onClick={handleClick}>
      Click me
    </div>
  )
}
```

### Animate Multiple Elements

```jsx
const [scope, animate] = useAnimate()

animate(".item", { opacity: 0.5 })
animate("h1", { y: -20 })
```

### Sequence Animations

```jsx
const sequence = async () => {
  await animate(scope.current, { x: 100 })
  await animate(scope.current, { y: 100 })
  await animate(scope.current, { x: 0, y: 0 })
}
```

### Animate with Options

```jsx
animate(scope.current, { scale: 1.5 }, {
  duration: 0.5,
  ease: "easeOut"
})
```

### Keyframes

```jsx
animate(scope.current, {
  x: [0, 100, 200, 0],
  scale: [1, 1.5, 1]
})
```

## Key Points

- `useAnimate` returns `[scope, animate]`
- `scope` is a ref to attach to elements
- `animate` function animates elements directly
- Can animate by selector or ref
- Supports sequences with `await`
- Works with any DOM element
- Useful for imperative animations

<!--
Source references:
- https://motion.dev/docs/react/use-animate
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/animation/hooks/use-animate.tsx
-->
