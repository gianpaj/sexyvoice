# Grok Wrapper Boundary Implementation Plan

## Objective

Replace the wrapper mark/decorations model with explicit opening and closing
`wrapperBoundary` nodes plus normal inline content between them.

## Phase 1: Replace the schema

1. Add a new `wrapperBoundary` TipTap node extension
2. Remove the wrapper mark extension and decoration plugin
3. Reuse the existing chip styling for wrapper boundaries

Deliverable:

- the editor schema contains real boundary nodes with visible chips

## Phase 2: Refactor conversion logic

1. Update `grokTextToTipTapDoc()` so wrapper tokens become:
   - opening boundary
   - inline content
   - closing boundary
2. Keep a zero-width internal anchor only for truly empty wrapper pairs
3. Update `grokTipTapDocToText()` to serialize from boundary nodes
4. Remove mark-diff serialization logic

Deliverable:

- Grok text round-trips through the new boundary-based schema

## Phase 3: Update editor commands

1. Keep instant-tag insertion as inline atom insertion
2. Replace wrapper insertion with selection replacement using boundary nodes
3. Support both:
   - wrapping current selection
   - inserting an empty wrapper at the cursor
4. Restore the caret inside the wrapper after insertion

Deliverable:

- wrapper interactions match the intended editing model

## Phase 4: Add deletion handling

1. Normalize the empty-wrapper anchor so it exists only for truly empty wrappers
2. Ensure typing inside an empty wrapper removes the anchor as soon as real
   content exists
3. Add targeted keyboard handling for boundary deletion
4. Ensure deleting at a closing boundary removes only the closing boundary
5. Ensure deleting at an opening boundary removes only the opening boundary

Deliverable:

- wrappers behave like explicit boundary-based structures, not stuck
  decorations

## Phase 5: Tests and verification

1. Update utility tests to assert `wrapperBoundary` JSON instead of wrapper
   marks
2. Update component tests for wrap, type, anchor normalization, and boundary
   delete flows
3. Run:
   - `pnpm exec vitest run components/grok-tts-editor.test.tsx tests/grok-tts-editor-utils.test.ts`
   - `pnpm type-check`
   - `pnpm exec biome check components/grok-tts-editor.tsx components/grok-tts/extensions/grok-wrapper-boundary.ts lib/grok-tts-editor.ts components/grok-tts-editor.test.tsx tests/grok-tts-editor-utils.test.ts`

Deliverable:

- the boundary-node wrapper model is verified at the conversion and editor
  layers

## Current Status

As of 2026-03-24, Phases 1 through 5 have been implemented in the current
working tree with the boundary-node design replacing the earlier single
`wrapperTag` container approach. Further refinement should build on this model
rather than reverting to marks or a single wrapper container node.
