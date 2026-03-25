# Grok Wrapper Boundary Design

## Summary

This design supersedes the wrapper-tag portion of:

- `docs/plans/2026-03-23-grok-tiptap-schema-design.md`
- `docs/plans/2026-03-23-grok-tiptap-schema-implementation-plan.md`

Instant tags remain inline atom nodes. Wrapper tags stop using a mark plus
decorations and instead become real inline editor content with explicit opening
and closing boundary nodes.

## Problem

The current wrapper model is structurally fragile:

- wrapper boundaries are only visual decorations
- empty wrappers rely on hidden placeholder text
- typing and deletion depend on mark-boundary behavior rather than real content

That mismatch causes disappearing close chips, unstable caret behavior, and
wrappers that do not delete naturally.

The first replacement idea, a single inline `wrapperTag` container node, solved
some rendering issues but still did not match the interaction model we want.
Users need wrapper boundaries to behave more like HTML tags:

- the opening and closing tags should be distinct visible units
- caret movement around them should be explicit
- deleting near one boundary should affect that boundary, not collapse the whole
  wrapper structure

## Goals

1. Model `<soft>...</soft>` and related wrappers as actual document nodes
2. Keep wrapped text directly editable between visible opening and closing chips
3. Let opening and closing wrapper tags behave as independent editor units
4. Preserve deterministic Grok-text parsing and serialization
5. Keep nested wrappers and instant tags working inside wrappers
6. Support empty wrappers with stable caret placement and typing behavior

## Proposed Schema

### Instant tags

No change:

- `instantTag` remains an inline atom node
- it stores the Grok tag in `attrs.tag`
- it renders as a non-editable chip

### Wrapper tags

Wrapper tags become a boundary-based inline structure.

Properties:

- opening boundary is a custom inline atom node named `wrapperBoundary`
- closing boundary is the same node type with `attrs.kind = 'close'`
- editable text and inline nodes remain normal content between the two boundary
  nodes
- each boundary stores `openTag`, `closeTag`, and `kind` in attrs
- each boundary renders as a visible non-editable chip

This means the editor document contains real boundary nodes plus normal inline
content between them. The wrapper is no longer inferred from marks, and it is
also not a single opaque container node.

### Empty wrappers

Empty wrappers still need one internal anchor position so the caret can sit
between the two boundaries. For that reason, the model keeps a zero-width anchor
text character between adjacent open and close boundaries only when the wrapper
is truly empty.

That anchor:

- is internal only
- is stripped during serialization
- is removed automatically once the wrapper contains real text or inline content

## Interaction Model

### Wrap selection

If the user selects text and chooses a wrapper tag:

1. build an opening `wrapperBoundary` node
2. keep the selected inline content as normal inline content
3. build a closing `wrapperBoundary` node
4. replace the selection with `open boundary + content + close boundary`
5. put the caret inside the wrapper after the wrapped content

### Insert empty wrapper

If the selection is empty:

1. insert `open boundary + zero-width anchor + close boundary`
2. place the caret on the anchor position between the two boundaries
3. allow typing directly into that position
4. remove the anchor once real content exists

This keeps the empty wrapper editable without collapsing the boundaries into one
opaque node.

## Parser and Serializer

`lib/grok-tts-editor.ts` remains the source of truth.

### Parser

The Grok text parser continues producing token trees. Conversion to TipTap JSON
changes so wrapper tokens become:

- opening `wrapperBoundary`
- inner inline content
- closing `wrapperBoundary`

For empty wrappers, the conversion inserts the internal zero-width anchor
between the two boundaries.

### Serializer

Serialization becomes boundary-driven:

- text nodes emit plain text
- `instantTag` nodes emit bracket syntax
- `wrapperBoundary(kind = 'open')` emits `openTag`
- `wrapperBoundary(kind = 'close')` emits `closeTag`
- the internal empty-wrapper anchor emits nothing

This removes the old mark-diff logic and keeps round-tripping explicit.

## Editing Semantics

The wrapper should render three visible pieces in flow:

- opening chip
- editable inline content between boundaries
- closing chip

The chips are non-editable. The content between them is normal editable inline
content and should stay in the regular text flow, including nested wrappers and
instant tags.

For deletion:

- deleting text inside a wrapper behaves like normal text editing
- deleting at a boundary should target that boundary node when possible
- deleting after a closing boundary should remove only the closing boundary
- deleting before an opening boundary should remove only the opening boundary
- if a wrapper becomes empty, the internal anchor should be restored so the
  caret can still enter it
- deleting a selected wrapper range should remove the selected boundaries and
  content cleanly

## Files

- replace `components/grok-tts/extensions/grok-wrapper-mark.ts`
- add `components/grok-tts/extensions/grok-wrapper-boundary.ts`
- update `components/grok-tts-editor.tsx`
- update `lib/grok-tts-editor.ts`
- update wrapper-related component and utility tests

## Testing

Add or update tests for:

- parsing wrapper text into boundary-node sequences
- serializing boundary-node sequences back to Grok text
- wrapping selected text
- inserting an empty wrapper and typing multiple characters into it
- keeping the closing boundary visible while typing
- deleting only the closing boundary when backspacing after it
- preserving empty wrappers with a stable caret position
- nested wrappers and instant tags inside wrappers

## Current Status

As of 2026-03-24, this boundary-node model is the active implementation
direction and reflects the current code more closely than the earlier
single-`wrapperTag` container proposal.
