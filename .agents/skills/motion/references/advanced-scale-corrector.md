---
name: advanced-scale-corrector
description: addScaleCorrector for layout projection
---

# addScaleCorrector

`addScaleCorrector` registers custom correctors for layout projection. When an element scales during a layout animation, correctors adjust certain styles (e.g. `borderRadius`, `boxShadow`) so they scale correctly. Use when you need custom style correction for projected elements.

## Usage

### Add Custom Corrector

```js
import { addScaleCorrector } from "motion/react"

addScaleCorrector({
  myProperty: {
    correct: (latest, node) => {
      // latest: current value, node: projection node
      return adjustedValue
    },
    applyTo: ["myProperty", "relatedProperty"],  // Optional
  },
})
```

### Built-in Correctors

Motion includes correctors for:

- `borderRadius`, `borderTopLeftRadius`, etc.
- `boxShadow`

These run automatically during layout projection.

### When to Use

- Custom CSS properties that should scale with layout
- CSS variables used in layout projections
- Extending Motion's default correction behavior

## ScaleCorrectorDefinition

```ts
interface ScaleCorrectorDefinition {
  correct: (latest: any, node: IProjectionNode) => any
  applyTo?: string[]  // Aliases for the same correction
}
```

## Key Points

- Run before layout animations (e.g. at app init)
- Correctors run when elements are projected with scale
- Used for `borderRadius` (percent-based) and `boxShadow`
- Advanced API for layout projection customization

<!--
Source references:
- packages/motion-dom/src/projection/styles/scale-correction.ts
- packages/motion-dom/src/render/utils/is-forced-motion-value.ts
-->
