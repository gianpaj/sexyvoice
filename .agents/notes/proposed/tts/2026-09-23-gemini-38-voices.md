# Gemini 3.8 voices and provider costs

Gemini 3.8 uses the `gpro38` alias. Keep `gpro31` supported for retained 3.1 rows
and historical usage; migrate public catalog rows with the reviewable SQL
in `scripts/add-gemini-38-voices.sql`, preserving their UUIDs.

Pass direction in `Part.speechMetadata.style` and the voice identifier in
`VoiceConfig.voice`. Do not prepend director notes to 3.8 transcripts.
Do not fall back to 2.5 for 3.8 requests: extended voice IDs are incompatible.
Keep streaming disabled for 3.8 pending separate streaming verification.

SDK 2.24.0 exposes these fields. Its exact-version release-age exception is
needed for the launch-day integration. The package's no-op preinstall is disabled.

Standard provider rates are $0.50/$9 per million input/audio tokens through
2026-12-31 and $1/$18 from 2027-01-01. Cost recovery uses the event timestamp.
Customer credit rates remain separate from recorded provider dollar costs.
Source: https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash-tts

The sample generator supports direct Google requests and the external API.
Direct sample costs are written to its local manifest, not customer usage events.
New Spanish samples have role-specific text and Castilian delivery instructions.

Verification: all nine Spanish samples returned WAV audio and token counts.
MP3s and the cost manifest are in `scripts/generated-speech/gemini-38-spanish/`.
The nine samples cost $0.022674 at standard provider rates. ffprobe validated
all nine MP3s. The SDK smoke test used an additional short tutor sample.

The focused suite, type checks, formatting checks, and OpenAPI generation passed.
Name-based clients must select gpro38 after their voice row is migrated.
Supabase catalog verification and regeneration await CLI authentication.
SQL is prepared for review and has not been executed.
