# Inworld saved voice hardening

Related: [Inworld call voices](2026-10-25-inworld-call-voices.md),
[saved voice samples](2026-10-25-saved-call-voice-samples.md),
[clone saved voices](../frontend/2026-10-25-clone-saved-voices.md).

## Decisions

| Decision                                                                                                                                    | Why                                                                                                                                                            | Rejected                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Inworld 429 and 5xx return `PROVIDER_UNAVAILABLE`; 400 and 422 return `errors.providerRequestRejected`; other statuses stay internal errors | Users retry a busy provider and change a rejected recording or text. A 401 or 403 means a bad or under-privileged key, which users cannot fix                  | 403 as `errors.guardrailViolation`; 429 as a rejected request          |
| Inworld clones send the owner's user ID as `description`                                                                                    | The workspace is shared by every user, so an orphaned voice should name its owner                                                                              | Display name prefixes                                                  |
| Inworld speech and samples are MP3 (`audioEncoding: 'MP3'`)                                                                                 | WAV at up to 2,000 characters is several times larger in R2 and downloads. Mistral stays WAV                                                                   | One format for both providers                                          |
| Sample keys carry their extension, and the sample route sets `Content-Type` from it                                                         | Stored `.wav` samples keep working beside new `.mp3` ones without a migration                                                                                  | A content-type column                                                  |
| A zero-credit `voice_cloning` usage event records each sample's provider cost                                                               | Saving is free, so the platform pays. Daily stats add its cost but count clones from `audio_files`; the user's Usage page lists it as a free cloning operation | Overhead baseline; charging users                                      |
| Generating with a saved voice requires the consent checkbox and `voiceConsent=true`                                                         | Permission covers each use of a voice, not only its creation                                                                                                   | Consent only when saving                                               |
| Inworld voices offer the accents in `INWORLD_ACCENTS`; a bare code speaks Inworld's default accent and is named after it                    | Existing `audio_references.locale` values stay valid, and only extra accents need a fallback when leaving Inworld mode                                         | Regional codes for every option, which would rewrite stored bare codes |

`no` keeps mapping to Inworld's `nb`, since Inworld's bare `no` is an
unevaluated tier. Delivery mode stays unset on the Clone page. SexyCall sets
`BALANCED` for calls.

## Save and delete loops

`MAX_SAVED_CALL_VOICES` counts current rows, so a paid user can save and
delete voices without limit. Each save costs about $0.003 of sample synthesis
(164 characters), and deleting removes the R2 sample, so 1,000 loops cost
about $3. The real risk is Inworld's clone rate limit, which every user
shares: a loop could slow other users' saves. The usage events make a loop
visible per user. A daily save limit through the existing Upstash rate
limiter is the follow-up if one appears.

## Verification

Vitest covers the error mapping and refunds, the clone `description`, MP3
requests and uploads, sample keys and content types, the usage event,
saved-voice consent on the route and Clone page, and accent options, routing
and fallback. Not checked: a live Inworld request with `audioEncoding: 'MP3'`
or a regional `languageCode`.
