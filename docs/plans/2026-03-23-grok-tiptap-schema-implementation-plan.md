# Grok TipTap Schema Implementation Plan

## Objective

Implement a proper TipTap schema for the Grok TTS editor so instant tags and
wrapper tags are represented as registered editor extensions instead of
unregistered JSON node types.

## Phase 1: Add TipTap extensions

1. Add an `instantTag` inline atom node extension
2. Add a `grokWrapper` mark extension
3. Register both extensions in the Grok editor alongside `StarterKit`

Deliverable:

- the editor schema recognizes Grok instant tags and wrapper formatting

## Phase 2: Refactor parser and serializer

1. Update `lib/grok-tts-editor.ts` to emit mark-based wrapper content
2. Keep instant tags as explicit inline node JSON
3. Update serialization to read wrapper marks instead of `wrapperTag` nodes
4. Preserve newline handling and malformed-tag fallback behavior

Deliverable:

- Grok text round-trips cleanly through the editor schema

## Phase 3: Update editor commands

1. Replace instant-tag insertion via full `setContent()` with editor-native
   insertion
2. Replace wrapper insertion with mark application over the current selection
3. No-op when wrapper insertion is requested without a selection
4. Keep controlled external updates working through `value` + `onChange`

Deliverable:

- effect actions operate on the current editor state without full-document
  rebuilds

## Phase 4: Update tests

1. Add tests for instant-tag insertion
2. Add tests for wrapper-mark application on selected text
3. Keep current rendering and multiline tests
4. Add serialization-focused utility coverage if needed

Deliverable:

- editor behavior is covered at the component and utility levels

## Verification

Run:

- `pnpm exec vitest run components/grok-tts-editor.test.tsx`
- targeted utility tests for Grok parser/serializer if added
- `pnpm type-check`
- Biome check on touched files

## Notes

- Wrapper tags are intentionally modeled as a mark because they behave like
  formatting over text
- Instant tags remain explicit inline tokens because they behave like atomic
  insertable units
- Avoid introducing extra editor features outside the scope of this schema fix
