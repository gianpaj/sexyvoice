# Domain language and product copy

## Decision

GLOSSARY.md defines voices, saved voices, characters, and generated audio.
Technical documentation uses speech generation for turning text into audio.
Marketing copy keeps voice generation and short phrases such as "Create a custom
AI voice". Forcing technical definitions into headlines was rejected because
it makes basic product copy harder to read.

Cloning has two flows: generating from a recording and saving a reusable voice.
Saved voices work for speech generation and character calls. Treating every
cloning request as audio-only was rejected because it excludes the saved flow.
A character combines a personality prompt and a selected voice.

## Scope

Keep the glossary canonical and link to it from writing guidance. Align the
feature guides and six website locales with the saved-voice and character flows.
Retain API routes, schema fields, and translation keys unless the copy needs a
new entry. Saving a voice is free for paid users; generation and calls use
credits. A top-up or subscription payment unlocks paid-user features.

## Verification

Formatting and type checks pass. All six locales have matching keys and the
changed values preserve their placeholders. The three focused FAQ and cloning
suites pass with 51 tests; the documentation link checker reports no errors.
