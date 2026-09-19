---
name: features-optimized-appear
description: Optimized appear animations for SSR and first paint
---

# Optimized Appear

Motion supports “optimized appear” animations: animations that are defined in HTML/CSS (e.g. via data attributes or inline styles) and then handed off to Motion on hydration. This avoids a flash of unanimated content and keeps first paint fast. Use for above-the-fold or critical enter animations when using SSR.

## Usage

### Data Attribute

Elements can carry a data attribute that Motion uses to find and take over the animation:

```html
<div
  data-motion-optimized-appear-id="hero"
  style="opacity: 0; transform: translateY(20px)"
>
  Content
</div>
```

On the client, Motion looks for `optimizedAppearDataAttribute` (and related IDs), measures layout, and starts the real animation. The initial style is used as the starting keyframe.

### Handoff

The handoff runs when Motion mounts. If `window.MotionIsMounted` is already true, optimized appear is skipped so only the main Motion tree drives animations.

### API (Advanced)

- `optimizedAppearDataAttribute` – attribute name (e.g. `data-motion-optimized-appear-id`).
- `optimizedAppearDataId` – property name for the element’s ID.
- `getOptimisedAppearId()` – generate stable IDs.
- `startOptimizedAppearAnimation(element, name, keyframes, options, onReady)` – internal; used by the handoff.

Most apps rely on the default behavior: use the data attribute and initial styles; Motion takes over on hydration.

## Key Points

- Reduces flash of unstyled content for enter animations with SSR.
- Use a single global ID per “appear” animation; Motion matches by ID.
- Only runs before Motion has mounted; after that, use normal `initial`/`animate`.
- Requires correct data attribute and initial styles so handoff has correct from-state.

<!--
Source references:
- packages/framer-motion/src/animation/optimized-appear/
- packages/motion-dom animation/optimized-appear
-->
