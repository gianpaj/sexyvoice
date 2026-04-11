---
name: utils-delay
description: Frame-synced delay utility for animations
---

# delay

`delay` runs a callback after a specified time, using Motion's frame loop instead of `setTimeout`. This keeps delays in sync with the animation system and avoids drift.

## Usage

### Basic Delay

```js
import { delay } from "motion/react"

const cancel = delay(() => {
  console.log("Ran after 1000ms")
}, 1000)

// Cancel if needed
cancel()
```

### delayInSeconds

Use seconds instead of milliseconds:

```js
import { delayInSeconds } from "motion/react"

delayInSeconds(() => {
  startAnimation()
}, 2)  // 2 seconds
```

### Overshoot Callback

The callback receives an overshoot value (elapsed - timeout) for precise timing:

```js
delay((overshoot) => {
  // overshoot is milliseconds past the target time
  console.log("Overshoot:", overshoot)
}, 1000)
```

### With Animation Chaining

```js
import { animate, delay } from "motion/react"

async function sequence() {
  await animate("#box", { x: 100 })
  await new Promise((resolve) => {
    delay(resolve, 500)
  })
  await animate("#box", { x: 0 })
}
```

## Key Points

- Timeout is in **milliseconds** for `delay`, **seconds** for `delayInSeconds`
- Returns a cancel function — call it to abort the scheduled callback
- Uses Motion's frame loop; more accurate than `setTimeout` for animation sequences
- Callback receives `(overshoot: number)` — milliseconds past the target time
- Exported from `motion/react` (from framer-motion's dom entry)

<!--
Source references:
- packages/motion-dom/src/utils/delay.ts
- packages/framer-motion/dom.ts (delay export)
-->
