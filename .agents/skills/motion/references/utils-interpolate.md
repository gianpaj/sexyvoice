---
name: utils-interpolate
description: Map input range to output range for value transformation
---

# interpolate

`interpolate` creates a function that maps a numerical input range to an output range. Supports numbers, colors (hex, hsl, rgb), and complex values. Use for custom value mapping when `useTransform` is not suitable (e.g. vanilla JS, non-React).

## Usage

### Basic Interpolation

```js
import { interpolate } from "motion/react"

const mapProgress = interpolate([0, 1], [0, 100])
mapProgress(0.5)  // 50

const mapOpacity = interpolate([0, 0.5, 1], [0, 1, 0])
mapOpacity(0.25)  // 0.5
```

### Color Interpolation

```js
const mixColor = interpolate([0, 1], ["#fff", "#000"])
mixColor(0.5)  // "rgba(128, 128, 128, 1)"

const hslMix = interpolate([0, 1], ["hsl(0, 100%, 50%)", "hsl(120, 100%, 50%)"])
```

### Options

```js
interpolate(
  [0, 1],
  [0, 100],
  {
    clamp: true,   // Clamp output to range (default: true)
    ease: "easeOut",
    // Or per-segment: ease: [ease1, ease2]
    mixer: customMixer,  // Custom mixer for output type
  }
)
```

### Without Clamping

```js
const unclamped = interpolate([0, 1], [0, 100], { clamp: false })
unclamped(1.5)  // 150 (extrapolates)
```

## Key Points

- Input and output arrays must have the same length
- Use for numbers, colors (hex, hsl, hsla, rgb, rgba), and complex strings
- `clamp: true` (default) limits output to the output range
- `ease` applies easing to the interpolation
- `useTransform` is the React equivalent for MotionValues

<!--
Source references:
- packages/motion-dom/src/utils/interpolate.ts
-->
