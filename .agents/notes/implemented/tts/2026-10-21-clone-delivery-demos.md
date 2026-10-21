# Voice cloning delivery demos

## Decision

The public cloning page and dashboard share the same native player. Kat and
Heike each offer Natural, Sarcastic, and Calm & slow takes. These cover a
baseline, an emotion, and an emotion combined with pacing without adding
another selector. Kat also offers “Same as original” first in the list, using
the full reference passage. Natural remains the default; unsupported voice/take
pairs fall back to it. Heike has no same-text comparison.

The sentences work as both a greeting and a sarcastic remark. Reusing each
sentence and reference across the short takes keeps attention on delivery.
The same-text example isolates similarity from changes in wording. Prompts
appear above the player with inline highlighted tags. The tags inherit the
sentence's font and baseline. A selectable span groups the complete prompt;
decorative quotation marks remain outside the selection.

One audio element handles original and generated audio. The shared waveform
renderer attaches to that element rather than creating another playback owner.
This prevents overlap without another playback coordinator. A source change
must commit before calling play within the click handler; a second source write
can interrupt playback and lose the browser's user gesture.

## Language selection and pending samples

The frontend catalog covers English, German, Spanish, French, Italian, Dutch,
Portuguese, Arabic, and Hindi. Each slot has a translated anxious prompt in
`apps/web/data/clone-demo-languages.ts`. A slot joins to a published speaker by
language; no speaker, reference URL, or playback is fabricated for pending slots.
Kat and Heike retain their independent references and matching published prompts.
The new anxious text is staged for replacement recordings, not applied to old audio.

The website locale selects and orders the language list on the server and client.
Browser-language detection was rejected because it can override an explicit site
language choice. Unsupported site locales fall back to English. Pending languages
show a localized notice and planned text, with no audio, delivery selector, or CTA.
They remain selectable so the frontend can be reviewed before recording approval.
Arabic planned text uses RTL direction.

The native language selector remains disabled until hydration to prevent an early
choice from being lost. Switching to a pending slot stops playback and removes
the waveform; returning to a published voice restores only a valid take.

`NativeAudioWaveform` creates one WaveSurfer instance per source with its own abort
signal. Cleanup aborts before destruction because WaveSurfer can queue a load
that starts after destruction. The demo waits for matching native metadata before
binding the waveform. Relying only on WaveSurfer destruction was rejected because
an obsolete fetch could rewrite the external audio element's source.

## Assets

The nine bundled MP3s use the site's own origin and cache behavior. Bundling
avoids reliance on public R2 object access.
Generating on click would add provider latency and spend credits before a
visitor has tried the product. Relabeling old clips would misrepresent which
model and tags produced them.

Reference inputs are authorized product demo recordings. Kat's complete
recording is supplied by the user; Heike uses the product demo reference. The
repository does not establish their upstream recording provenance or make a
public-domain or licensing claim. Input and asset hashes are in
`apps/web/data/clone-demo-assets.json`. Per-request `sourceHash` values preserve
which reference version produced each Kat take.

Generation preserves the full reference and converts a separate copy to mono
24 kHz WAV for `voxtral-mini-tts-3-0`. The playback reference is normalized from
the source recording, not the downsampled API input. Kat's complete reference
and same-text result target -14 LUFS; the existing short takes and all Heike
recordings retain their shipped audio. This bounds the comparison change rather
than regenerating unrelated clips.

The shared normalizer measures the decoded 128 kbps MP3, accepts -14 ±0.5 LUFS
and peaks at or below -1.5 dBTP, and permits at most four encodes from the original
input. Measured PCM gain with a high-rate limiter corrects loudnorm's dynamic
fallback when its offset adjustment cannot reach the target. Verifying only the
PCM filter output was rejected because MP3 encoding can alter peaks and level.

The manifest's provider costs are estimates, not billing receipts. Latency is
recorded only when captured; the same-text request has an unrecorded latency
and uses `null`. The script saves the raw WAV and request metadata before
encoding so normalization failures do not require another paid request.

## Applying a demo

Applying a take loads its reference, tagged text, and language. It does not
submit the form or grant consent. A pending reference download cannot replace
an uploaded file or microphone recording. The landing CTA preserves its two
selection IDs through login, signup, OAuth, and email confirmation. Signup
continuation accepts only supported voice/take pairs in supported site locales.

The public page retains its preview gate pending review. Its mobile hero gives
the demo priority over the decorative waveform.

## Verification

The published Kat reference measures -14.30 LUFS / -2.29 dBTP over 13.406 seconds;
the same-text clone measures -14.41 LUFS / -2.24 dBTP over 13.28 seconds. All
nine shipped MP3s match the manifest's SHA-256 hashes. The unprocessed Kat
replacement is retained locally under
`scripts/.cache/kat-same-original-20261021/references/kat-reference.mp3`.

Frontend validation passed: 1,765 web tests, nine public voice-cloning browser
tests, translation parity, formatting, type checks, and desktop/mobile inspection,
including Arabic RTL. Eighteen unrelated web tests are skipped. The frontend
language catalog does not change audio, reference inputs, generation code, or
published prompt metadata.

See [prepared cloning demos](../../../../ARCHITECTURE.md#prepared-cloning-demos)
for runtime paths and [generation instructions](../../../../scripts/README.md#generate-prepared-cloning-demos)
for refreshing the assets.
