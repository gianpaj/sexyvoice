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

`NativeAudioWaveform` retains one WaveSurfer instance per native media element
and interaction mode, with its own abort signal. The waveform host stays mounted
across take, reference, and retry changes. A pending metadata change leaves the
current waveform visible; matching metadata permits loading the new cached peaks.
The source URL is not a component key or instance-owner dependency. Remounting
per URL was rejected because it clears the canvas and repeats decoding.

Cleanup aborts before destruction because WaveSurfer can queue a load that starts
after destruction. Relying only on destruction was rejected because an obsolete
fetch could rewrite the external audio element's source. Instance creation and
updates always receive precomputed peaks, so they make no waveform fetch or
`decodeAudioData` call. Only the native element loads MP3s for playback.

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

## Precomputed waveform data

`scripts/generate-audio-waveforms.mts` adds per-channel peak arrays under each
manifest asset's `waveform` field. `sourceSha256` records the exact final audio
used for extraction, separately from the asset hash, so an asset metadata update
cannot make stale peaks appear current. Matching files and resolution are skipped.
Explicit input files support adding future speaker takes without processing the
other clips. A failed batch or detected concurrent manifest edit publishes no changes.

The extractor uses local FFmpeg analysis at 8 kHz, retains each channel, and
stores 256 signed maxima per channel rounded to four decimals. Peak arrays use
normalized amplitudes rather than a WaveSurfer-specific representation. The
small curated catalog stays in repository JSON; R2 sidecar requests were rejected
for this catalog because they add a request before drawing. Audio normalization
and waveform extraction remain separate operations; extraction does not modify
recordings or call a provider.

The nine current MP3s have verified source hashes and peaks. Existing request,
duration, and hash fields are unchanged. Clip objects expose the manifest arrays
by reference, and asset resolution rejects a waveform source hash that differs
from its audio hash. The renderer uses `load(url, peaks, duration)` for ready
source changes; retries increment a reload token without replacing the renderer.

See [waveform generation](../../../../scripts/README.md#generate-waveform-peaks)
for the command and options.

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

Validation passed: 1,773 web tests, 131 script tests, formatting, and type
checks. The waveform CLI and extractor have 40 focused tests; the 35 demo-data
tests include hash and peak validation. Eighteen unrelated web tests
are skipped. Frontend verification includes ten public voice-cloning browser tests,
translation parity, and desktop/mobile inspection with Arabic RTL. The cached
waveform regression verifies a persistent host, no blank canvas frames, no MP3
fetch/XHR for waveform drawing, and no `decodeAudioData` calls.
The language catalog does not change audio, reference inputs, generation code,
or published prompt metadata.

See [prepared cloning demos](../../../../ARCHITECTURE.md#prepared-cloning-demos)
for runtime paths and [generation instructions](../../../../scripts/README.md#generate-prepared-cloning-demos)
for refreshing the assets.
