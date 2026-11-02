---
name: advanced-motion-config
description: Global configuration and reduced motion
---

# MotionConfig

`MotionConfig` provides global configuration for Motion components. Use for setting defaults, enabling reduced motion, and configuring animation behavior.

## Usage

### Basic Configuration

```jsx
import { MotionConfig } from "motion/react"

function App() {
  return (
    <MotionConfig
      transition={{
        duration: 0.3,
        ease: "easeOut"
      }}
    >
      {/* All motion components inherit config */}
    </MotionConfig>
  )
}
```

### Reduced Motion

Respect user's reduced motion preference:

```jsx
<MotionConfig reducedMotion="user">
  {/* Respects prefers-reduced-motion */}
</MotionConfig>
```

Options:
- `"user"` - Respects system preference
- `"always"` - Always reduce motion
- `"never"` - Never reduce motion

### Custom Reduced Motion

```jsx
<MotionConfig
  reducedMotion="user"
  transition={{
    reducedMotion: {
      duration: 0.01  // Instant transitions when reduced
    }
  }}
>
  {/* ... */}
</MotionConfig>
```

### Static Mode

For non-interactive contexts (like Framer canvas):

```jsx
<MotionConfig isStatic>
  {/* Components render but don't animate */}
</MotionConfig>
```

### transformPagePoint

Transform pointer/measurement coordinates. Essential for SVG with viewBox or scaled containers:

```jsx
import { MotionConfig, transformViewBoxPoint } from "motion/react"

const svgRef = useRef(null)

<MotionConfig transformPagePoint={transformViewBoxPoint(svgRef)}>
  <svg ref={svgRef} viewBox="0 0 100 100" width={500} height={500}>
    <motion.rect drag width={10} height={10} />
  </svg>
</MotionConfig>
```

Custom transform:

```jsx
<MotionConfig transformPagePoint={(p) => ({ x: p.x / 2, y: p.y / 2 })}>
```

### MotionGlobalConfig

Global overrides (use sparingly):

```js
import { MotionGlobalConfig } from "motion/react"

MotionGlobalConfig.instantAnimations = true   // Skip animations
MotionGlobalConfig.useManualTiming = true     // For deterministic tests
MotionGlobalConfig.mix = customMixer          // Custom value mixing
```

## Key Points

- `MotionConfig` sets global defaults
- `transformPagePoint` for SVG viewBox and scaled layouts
- `transformViewBoxPoint(svgRef)` creates a viewBox-aware transform
- `MotionGlobalConfig` for global overrides
- Wrap app or component tree
- `reducedMotion` respects accessibility
- Config applies to all child components

<!--
Source references:
- https://motion.dev/docs/react/motion-config
- https://github.com/motiondivision/motion/tree/main/packages/framer-motion/src/components/MotionConfig
-->
