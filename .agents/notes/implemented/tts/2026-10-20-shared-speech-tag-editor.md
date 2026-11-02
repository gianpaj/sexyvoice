# Shared speech tag editor

The shared `TTSEditor` takes a Grok or Voxtral provider. Tag catalogs configure
parsing, inline chips, suggestions, highlighting, and serialization. The Grok
wrapper keeps existing callers compatible. Voxtral cloning uses the shared
editor; Chatterbox locales retain their textarea.

Sharing the editor preserves the existing selection handling and character
limits. A separate Voxtral editor would duplicate that behavior and its fixes.
Voxtral has no paired wrappers or Grok language selector. Its picker groups
34 emotions, five paces, and the documented vocal sounds by category.

Plain text is the form and API contract. Tags survive copy, paste, provider
changes, and multiline serialization. Unknown tags remain editable text and
receive unsupported-tag highlighting. Tag characters count toward text limits.

Tag conversion maps selections using serialized tag lengths so typing can
continue after a chip. Clipboard serialization uses single line breaks and
includes Grok wrapper boundaries.

See [tagged speech editing](../../../../ARCHITECTURE.md#tagged-speech-editing)
for the application behavior and provider language limits.
