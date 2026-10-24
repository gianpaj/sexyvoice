# Clone language routing

The dashboard and `POST /api/clone-voice` share the supported locale sets in
`apps/web/lib/clone/constants.ts`. Voxtral 3 handles 22 confirmed languages.
Chatterbox handles Danish, Finnish, Hebrew, Malay, Swedish, and Swahili, plus
an explicit English option. The dropdown contains 28 languages.

Mistral’s [language reference](https://docs.mistral.ai/studio/audio/specs-and-limits/languages)
lists 21 distinct TTS preset languages. Its
[launch article](https://mistral.ai/news/voxtral-3/) also confirms Greek.
The claimed 35-language TTS coverage is not fully enumerated; transcription
language lists do not establish TTS support. Unconfirmed Chatterbox languages
retain their provider rather than being advertised as Mistral-supported or
Mistral-unsupported.

The locale sets also select reference duration, text limits, the Voxtral editor,
and saved-voice eligibility. Saved-voice copy avoids a duplicated language list.
Public cloning copy lists the same 28 languages. No external API v1 cloning
endpoint is introduced; the updated API is the dashboard clone endpoint.

## Verification

Provider routing tests cover all 13 additional Mistral choices, the six retained
Chatterbox languages, and explicit English Chatterbox. Saved-profile tests cover
Polish and Catalan. UI tests check new dropdown names and localized processing
messages. The full suite passes with 1,731 tests and 18 existing skips.
Formatting, type checks, translation parity, and diff whitespace checks pass.
The Polish live synthesis probe is recorded under
`/tmp/sexyvoice-polish-clone-2026-10-22/`; the language expansion uses mocked
provider tests and does not assess native pronunciation in each language.

Implementation is committed locally; deployment remains pending.
