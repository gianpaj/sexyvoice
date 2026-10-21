# Voice cloning delivery demos

## Decision

The public cloning page and dashboard share the same native player. Kat speaks
one English sentence; Heike speaks one German sentence. Each offers Natural,
Sarcastic, and Calm & slow takes. Three takes cover a baseline, an emotion, and
an emotion combined with pacing without adding another selector.

The sentences work as both a greeting and a sarcastic remark. Reusing each
sentence and reference across takes keeps attention on delivery. Prompts are
available under a disclosure so visitors can inspect and reuse the tags.

One audio element handles original and generated audio. This prevents overlap
without a waveform library or another playback coordinator. A source change
must commit before calling play within the click handler; a second source write
can interrupt playback and lose the browser's user gesture.

## Assets

The eight bundled MP3s total 706,144 bytes. Bundling avoids the public R2 URLs
that returned 403 and gives playback the site's own origin and cache behavior.
Generating on click would add provider latency and spend credits before a
visitor has tried the product. Relabeling old clips would misrepresent which
model and tags produced them.

Reference inputs come from the existing product demo objects
`clone-demos/kat-reference.mp3` and `clone-demos/heike-reference.mp3`. The
repository does not establish their upstream recording provenance; this change
makes no new public-domain or licensing claim. Original input hashes are in
`apps/web/data/clone-demo-assets.json`.

Each reference is trimmed to 12 seconds and converted to mono 24 kHz WAV.
`voxtral-mini-tts-3-0` generates all six takes. MP3 previews share a -16 LUFS
normalization target. The generation script retains raw WAVs and records full
response times, estimated costs, durations, and asset hashes.

The six speech requests took 853–1,792 ms each and cost an estimated $0.00494 in
total at $13 per million input characters. These are individual requests, not a
latency benchmark or a billing receipt. Separate Voxtral 3 transcription checks
returned the exact configured sentence for all six MP3s. Transcription checks
content completeness; they do not establish perceptual quality or identity.

## Applying a demo

Applying a take loads its reference, tagged text, and language. It does not
submit the form or grant consent. A pending reference download cannot replace
an uploaded file or microphone recording. The landing CTA preserves its two
selection IDs through login, signup, OAuth, and email confirmation. Signup
continuation accepts only the six fixed demo paths in supported site locales.

The public page retains its preview gate pending review. Its mobile hero gives
the demo priority over the decorative waveform.

See [prepared cloning demos](../../../../ARCHITECTURE.md#prepared-cloning-demos)
for runtime paths and [generation instructions](../../../../scripts/README.md#generate-prepared-cloning-demos)
for refreshing the assets.
