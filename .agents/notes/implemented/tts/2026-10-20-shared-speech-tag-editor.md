# Shared speech tag editor

The shared `TagEditor` in `apps/web/components/speech-tags/` takes a Grok or
Voxtral provider. The tag catalogs in `catalog.ts` configure parsing, inline
chips, suggestions, highlighting, serialization, and split-safe cutting.
Voxtral cloning uses the shared editor; Chatterbox locales retain their
textarea.

Sharing the editor preserves the existing selection handling and character
limits. A separate Voxtral editor would duplicate that behavior and its fixes.
Voxtral has no paired wrappers. Its picker groups 34 emotions, five paces, and
the documented vocal sounds by category. The Grok language picker is a
generation setting outside the editor.

Plain text is the form and API contract. Tags survive copy, paste, provider
changes, and multiline serialization. Unknown tags remain editable text and
receive unsupported-tag highlighting. Tag characters count toward text limits.

Tag conversion maps selections using serialized tag lengths so typing can
continue after a chip. Clipboard serialization uses single line breaks and
includes Grok wrapper boundaries.

See [tagged speech editing](../../../../ARCHITECTURE.md#tagged-speech-editing)
for the application behavior and provider language limits.
