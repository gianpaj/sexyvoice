# Cloned voice calls: learnings and follow-ups

Covers sexyvoice #650 and sexycall #101, which let paid users clone a voice
and call a character that speaks with it. Related notes:
[Inworld call voices](2026-10-25-inworld-call-voices.md),
[saved voice samples](2026-10-25-saved-call-voice-samples.md),
[clone saved voices](../frontend/2026-10-25-clone-saved-voices.md).

## Decisions

| Decision                                                                                 | Why                                                                                                                                | Rejected                                                                                |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Inworld is the provider for saved call voices                                            | Mistral's guardrail returns 403 `guardrail_violation` on sexual text, including the fixed preview sample, and cuts calls mid-reply | Mistral as default; a neutral preview line for Mistral, which would still fail mid-call |
| Saved voices are written by the server only                                              | Users could otherwise insert or edit `audio_references` rows and point them at any provider voice                                  | Row-level insert/update policies                                                        |
| Billing starts just before `session.start()`                                             | STT, LLM and TTS cost money from that moment; job setup and memory preload are free                                                | Starting at participant join; starting after the greeting                               |
| The call timer starts when the agent first reports `listening`, `thinking` or `speaking` | That is when billing starts, so the timer and the bill agree                                                                       | Starting on room connect, which counted "Connecting…"                                   |
| A card's Call starts the call; the card body opens the panel                             | One click to call; the panel stays the place that explains a blocked call                                                          | Call opening the panel                                                                  |
| Free users see paid features disabled, next to `UpgradeCrown`                            | They learn what a plan adds; the crown links to the plans, so touch screens get there without a tooltip                            | Hiding paid features from free users                                                    |
| Saved Inworld voices take the generation language                                        | Inworld TTS-2 speaks other languages natively; similarity is best in the cloned language                                           | Locking a voice to its saved locale                                                     |

## Gotchas

- `INWORLD_API_KEY` is the Basic credential exactly as Inworld shows it. A
  re-encoded value fails with 403 `API key does not exist`, and the key ID in
  the message starts with `SU5X` (Base64 for `INW`). Inworld documents one
  clone error, `insufficientAccessLevel`, for keys without Voice write access.
- Inworld has no inline reference audio. A one-off clone would need
  clone, speak, then delete, against cloning's lower rate limits.
- `LiveKitRoom` creates its room in an effect and renders children one render
  later. `PlaygroundStateProvider` rewrites the URL on mount before
  `CallExperience` exists, so the call page reads `?custom=1&voice=` on the
  server and passes `returnFromClone`.
- `connect()` reads the selected character from the render it came from.
  Calling a character that is not selected yet selects it, then starts the
  call in an effect after the next render (`callCharacter`).
- Browsers give form controls `cursor: default`, which beats a label's
  pointer. Tailwind v4 also leaves buttons at `default`.
- Firefox hides microphone IDs and labels until the page has used the
  microphone; ask LiveKit for permission only when the menu opens.
- next-intl's `Link` imports `next/navigation` without an extension. Vitest
  inlines `next-intl` so components that use it load in tests.
- Vercel environment changes need a redeploy; reusing the build cache is fine
  for server-only variables. Without the Vercel MCP, read logs with
  `vercel logs -p sexyvoice --scope gianpaj --deployment <id> --status-code 500 -x`.

## Process lessons

- Grep `apps/web/e2e/` and `E2E_TEST_PLAN.md` when UI behaviour changes. Unit
  tests mock the pieces that Playwright exercises, so one free-user change
  passed unit tests and broke e2e.
- Pass explicit paths to `biome check --write --unsafe`. Without paths it
  rewrote unrelated test and e2e files across the app.
- Commit so each commit builds on its own. Removing a flag's file and its last
  import belong in the same commit.
- Push once per review round. Each push starts a Pullfrog run, and Pullfrog
  reliably flags copied logic: extract it (`callReadiness`,
  `savedVoiceMissing`, `faqAnswerText`, `UpgradeCrown`).
- Copy about cloning says "your voice", mentions rights or permission, and
  gives the minimum as 10 seconds (`CLONE_MIN_AUDIO_SECONDS`).

## Follow-ups

- [ ] Confirm the production agent runs sexycall #101 (merged) and the
      production `INWORLD_API_KEY` is the plain credential, then resolve the
      `CALL_CLONE_PROVIDER` rollout thread on #650.
- [ ] Approve the Argos builds for the changed Clone and call screens.
- [ ] Remove the Mistral call path and Mistral saved voices.
- [ ] Decide whether one-off clones move to Inworld (clone, speak, delete)
      so cloning and calls use one provider.
- [ ] Check whether the agent sends the call language to Inworld before
      adding a "which languages can a cloned voice speak" FAQ.
- [ ] Align the non-English FAQ sample range ("10 seconds to 5 minutes") with
      English ("at least 10 seconds").
- [ ] Fix announcement typos: German "schliessen", Spanish "Iniciar sesion".
- [ ] Keep cloned voices consistent across replies: sexycall #106.
- [ ] Add Inworld voice effects to the Clone page editor: sexyvoice #675.
