# Voice picker name wrapping

`apps/web/components/voice-picker.tsx` lets voice names and descriptions wrap
inside list rows. The selected-voice trigger grows with its content and keeps a
48px minimum height.

Names and descriptions use `min-w-0 max-w-full break-words`. The width constraints
let unbroken names wrap inside flex rows without covering the selection icon.

The selected model dot stays beside its metadata in a single flex row. The text
shrinks and wraps inside its span, so a long description cannot leave the dot
on a row by itself.

The picker uses `getVoiceDisplayName()` for names. Its filters, keyboard controls,
and audio preview progress remain part of the shared component.

The chosen layout keeps the full name readable on narrow screens. Ellipsizing
names or fixing the trigger height would hide content. Clamping only the
metadata would change the PR's intended wrapping behavior, so metadata wraps too.

Validation covers `pnpm fixall`, `pnpm lint`, `pnpm type-check`, and the seven
existing voice picker tests. CSS wrapping still needs visual review on mobile.
