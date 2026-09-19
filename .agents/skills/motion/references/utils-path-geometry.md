---
name: utils-path-geometry
description: calcLength, createBox, distance for projection and geometry
---

# calcLength, createBox & distance

Geometry utilities for layout projection and distance calculations.

## calcLength & createBox

`calcLength` and `createBox` are geometry utilities used by Motion's layout projection system. Use when building custom projection logic, constraints, or layout measurement tools.

## Usage

### createBox

Creates an empty `Box` (viewport/axis representation):

```js
import { createBox } from "motion/react"

const box = createBox()
// box = { x: { min: 0, max: 0 }, y: { min: 0, max: 0 } }
```

### calcLength

Returns the length of an axis (max - min):

```js
import { calcLength, createBox } from "motion/react"

const box = createBox()
box.x.min = 10
box.x.max = 110

calcLength(box.x)  // 100
```

### With Drag Constraints

Used internally for resolving `dragConstraints` and elastic boundaries. For custom constraints:

```js
import { calcLength, createBox, mixNumber } from "motion/react"

// Calculate scale between source and target boxes
const scale = calcLength(targetAxis) / calcLength(sourceAxis)
```

## Types

- **Box**: `{ x: Axis, y: Axis }` — Axis has `min` and `max`
- **Axis**: `{ min: number, max: number }`

## distance & distance2D

Distance between numbers or 2D points:

```js
import { distance, distance2D } from "motion/react"

distance(10, 50)                    // 40
distance2D({ x: 0, y: 0 }, { x: 3, y: 4 })  // 5
```

Used internally for pan/drag thresholds. Exported from `motion` via dom.

## Key Points

- Low-level projection geometry primitives
- `createBox()` returns a mutable box; reuse to avoid allocations
- `calcLength(axis)` returns `axis.max - axis.min`
- `distance(a, b)` = `Math.abs(a - b)`; `distance2D` uses Euclidean distance
- Exported for advanced layout/projection use cases

<!--
Source references:
- packages/motion-dom/src/projection/geometry/models.ts
- packages/motion-dom/src/projection/geometry/delta-calc.ts
- packages/framer-motion/src/gestures/drag/utils/constraints.ts
-->
