---
name: advanced-transform-template
description: Custom transform output with transformTemplate
---

# transformTemplate

`transformTemplate` overrides how Motion builds the `transform` string. Use when you need a different transform order, custom format, or to append/prepend the generated transform.

## Usage

### Custom Transform Order

Default order: translate, scale, rotate. Override:

```jsx
import { motion } from "motion/react"

<motion.div
  style={{ x: 100, rotate: 45 }}
  transformTemplate={({ x, rotate }) =>
    `rotate(${rotate}deg) translateX(${x}px)`
  }
/>
```

### Append to Generated

Second argument is the auto-generated transform:

```jsx
<motion.div
  transformTemplate={({ x, y }, generated) =>
    `${generated} perspective(500px)`
  }
/>
```

### Override Entire Transform

```jsx
<motion.div
  transformTemplate={() => "translateY(20px)"}
/>
```

### With Variants

```jsx
<motion.div
  initial={{ x: 0 }}
  animate={{ x: 100, rotate: 180 }}
  transformTemplate={({ x, rotate }) =>
    `translateX(${x}px) rotate(${rotate}deg)`
  }
/>
```

## Parameters

- **First**: Latest animated transform values (e.g. `{ x, y, scale, rotate }`)
- **Second**: The generated transform string from Motion

## Key Points

- Affects layout animations — FLIP uses the template for measurements
- When defined, WAAPI is not used for transform (Motion uses JS animation)
- Use for transform order, custom units, or combining with CSS
- Return value becomes the element's `transform` style

<!--
Source references:
- packages/motion-dom/src/node/types.ts (transformTemplate)
- packages/motion-dom/src/render/html/utils/build-transform.ts
-->
