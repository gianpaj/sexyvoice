# Grok TipTap Schema Design

## Summary

Refactor the Grok TTS editor to use a real TipTap schema for Grok tags instead
of generating custom JSON node types that are not registered with the editor.

The new model should:

- represent instant tags like `[pause]` as TipTap inline atom nodes
- represent wrapping tags like `<soft>...</soft>` as a TipTap mark
- keep parsing and serialization centralized in `lib/grok-tts-editor.ts`
- use editor-native commands for insert and apply operations
- preserve plain-text round-tripping to Grok tag syntax

## Current Problem

The current editor converts Grok text into a JSON document containing custom
node types such as `instantTag` and `wrapperTag`, but the editor only registers
`StarterKit`.

That causes runtime warnings and invalid content errors when `setContent()`
receives JSON containing unknown node types.

The current wrapper-tag behavior also does not match editor semantics well. It
inserts `<tag></tag>` text at the cursor instead of applying a formatting-like
operation to the selected text.

## Goals

1. Fix the schema mismatch permanently
2. Model instant tags as structured inline content
3. Model wrapping tags as formatting over selected text
4. Keep Grok text import/export deterministic
5. Reduce document-wide `setContent()` usage during normal editing

## Non-goals

1. Do not redesign the full Grok editor UI
2. Do not add a large toolbar or advanced rich-text formatting
3. Do not support malformed wrapper-tag nesting beyond reasonable fallback
4. Do not add persistence changes or database changes

## Proposed Schema

### Instant tags

Instant tags such as `[pause]`, `[laugh]`, and `[breath]` should be represented
as a custom inline atom node named `instantTag`.

Properties:

- inline
- atom
- non-editable as text content
- stores the tag string in `attrs.tag`

This makes instant tags behave like a single insertable token inside the text
flow.

### Wrapping tags

Wrapping tags such as `<soft>...</soft>` and `<fast>...</fast>` should be
represented as a custom mark named `grokWrapper`.

Properties:

- applies over selected text
- stores the wrapping tag pair in attrs
- serializes back to explicit open/close Grok tags

This matches the semantics of wrapping tags more closely than using a custom
inline container node. Wrapping tags behave like formatting applied to text, not
like self-contained embedded content.

## Interaction Model

### Insert instant tag

When the user chooses an instant tag from the effects popover:

1. insert an `instantTag` node at the current selection
2. preserve surrounding text
3. do not rebuild the full document string

### Apply wrapping tag

When the user chooses a wrapping tag:

1. require a non-empty text selection
2. apply the `grokWrapper` mark to the selected text
3. close the popover
4. do nothing if there is no selection

This is the most natural editing behavior and aligns with the chosen mark
model.

## Parser and Serializer

`lib/grok-tts-editor.ts` remains the source of truth for Grok text import and
export.

### Parser

The parser should convert Grok text into a TipTap/ProseMirror-compatible JSON
document using:

- paragraph nodes
- text nodes
- `instantTag` nodes
- text nodes with `grokWrapper` marks

Wrapper-tag nesting should map to nested marks when valid. If the source text
is malformed, the parser should fall back to plain text rather than producing an
invalid schema.

### Serializer

The serializer should walk the document JSON and emit:

- plain text for text nodes
- bracket syntax for `instantTag`
- open/close wrapping tags around marked text

Serialization must preserve line breaks and produce valid Grok text output.

## Editor State Strategy

Use the editor as the primary state machine during interactive editing.

Guidelines:

- use `setContent()` only for initial load and controlled external updates
- use editor commands for interactive changes
- continue deriving the external value with `onUpdate`
- continue enforcing `maxLength`, but do so without schema corruption

## Files to Update

- `components/grok-tts-editor.tsx`
- `lib/grok-tts-editor.ts`
- new extension files, recommended:
  - `components/grok-tts/extensions/instant-tag.ts`
  - `components/grok-tts/extensions/grok-wrapper-mark.ts`
- `components/grok-tts-editor.test.tsx`
- any utility tests covering parsing and serialization

## Testing Strategy

Add or update tests for:

- rendering a document containing instant tags
- inserting an instant tag from the effects menu
- applying a wrapper mark to selected text
- serializing marked content back to Grok text
- preserving multiline behavior
- ensuring no invalid-content warning path remains for supported content

## Recommendation

Implement a real TipTap schema with:

- `instantTag` as a custom inline atom node
- `grokWrapper` as a custom mark

This is the clean long-term fix. It matches the content model, fixes the schema
warning at the root cause, and gives the editor a stable base for future Grok
editing features.
