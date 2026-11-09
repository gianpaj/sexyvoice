# Small character avatars with Jev

Research date: 2026-10-21. Status: proposed. This plan covers custom call
characters. It does not change voice generation or start implementation.

## Outcome

Generate a recognizable portrait when someone creates a custom character.
Show the saved character immediately with its initials, then replace the initials
when the portrait arrives. Keep the portrait small, inexpensive, and stable
across visits.

Start with 16×16 pixel art in a fixed 16-color palette. Ask Jev for pixel colors,
then render the result in code. Benchmark portrait quality before connecting it
to the application. A low-resolution painting demo does not establish that faces
will look good in our circular avatars.

## What the research establishes

[Jev Paint](https://github.com/achimala/jev-paint) turns decisions into an image.
Its [question builder](https://github.com/achimala/jev-paint/blob/main/web/jev.mjs)
supports palette, HSL, binary RGB, and silhouette representations on grids from
8×8 to 32×32. Palette mode asks one `choice` question per pixel with 16 colors.
It splits palette requests into batches of 144 pixels and runs up to four batches
concurrently. Every batch receives the complete description and global coordinates.

The [renderer description](https://github.com/achimala/jev-paint#rendering) explains
how probability distributions become a textured 560×560 painting. Those strokes
and lighting effects are optional presentation work. Our first version needs
only a crisp pixel grid.

The project has an [MIT license](https://github.com/achimala/jev-paint/blob/main/LICENSE).
Preserve its copyright and license notice if copying code. Its browser key storage
and local Python proxy suit its local studio; our application should call TypeSafe
from an authenticated server route.

TypeSafe's official [HTTP reference](https://docs.typesafe.ai/api/system-one)
documents `POST https://api.typesafe.ai/v1/systemone`, Bearer authentication,
and a body containing `model`, `state`, and `questions`. Answers use the question
IDs and include token usage. Jev returns typed decisions, not an image file or
generated SVG markup. This is the same state-and-questions pattern used for
decisions, with pixel colors as the answers.

The [Choice documentation](https://docs.typesafe.ai/primitives/choice) defines
`choice`, `probabilities`, and `confidence`. Questions are evaluated independently.
Sharing a description does not guarantee that neighboring pixels form a coherent
face. That is the main quality risk.

The official [models page](https://docs.typesafe.ai/models) lists `jev-1.13.0`
and `jev-1.14.0` at $0.042 per million input tokens, with free output tokens.
Default limits are 64k tokens per request and 32k per question, including state.
Question count has no separate fixed limit. The demo's 144-pixel batch is its
own choice, not a documented provider maximum. Organization rate limits still
apply.

That page lists `jev-latest` as 1.13 and `jev-preview` as 1.14. The
[October 14 release post](https://typesafe.ai/blog/jev-1-14) schedules a later alias
change. Pin a concrete version and verify availability during the benchmark.
Image-input and long-context experiment flags are unnecessary for this design.

The supplied [X post](https://x.com/anshuc/status/2101279707228483709) returned
HTTP 403 during research. No performance or quality claim here relies on its
contents. No live TypeSafe generations were run; latency and cost below are
targets and calculations, not measurements.

## Fit with the application

- `apps/web/app/api/characters/route.ts` creates and updates private characters
  for paid users. Creation has a ten-character limit. Preserve these checks.
- `apps/web/components/call/create-character-dialog.tsx` collects a name,
  description, voice, and instructions. `preset-save.tsx` also creates characters
  through Save as new. Both paths need the same avatar behavior.
- `apps/web/lib/characters.ts` maps the existing nullable `characters.image`
  text column to `Preset.image`. The character queries already select it.
- `apps/web/components/call/preset-selector.tsx` displays 56 px and 64 px circular
  avatars. It interprets image values as `/characters/<filename>` and uses initials
  when no image exists. Generated image values need their own renderer branch.
- `.agents/notes/implemented/ci/2026-09-28-jev-review-gate.md` records the Jev
  review integration. It is a workflow integration, not a reusable application
  client. `docs/devops.md` documents `TYPESAFE_API_KEY` for GitHub Actions;
  application runtime access must be configured separately.
- `apps/web/lib/inngest/client.ts` exists, but the Inngest route registers no
  functions. This feature does not need a durable job system for its first version.

## Approaches

| Approach                      | Work per avatar                                                        | Trade-off                                                               | Recommendation                                 |
| ----------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| Palette pixel art             | 144 questions at 12×12 or 256 at 16×16                                 | Closest to Jev Paint; portrait coherence needs testing                  | Start here                                     |
| Jev chooses portrait parts    | A small set of questions for hair, expression, accessories, and colors | Reliable composition, but requires a maintained set of compatible parts | Consider if pixel portraits fail the benchmark |
| Conventional image generation | An image-model request plus file storage                               | More detail, another provider workflow, and different latency           | Outside this plan                              |

Use hard palette selections for the first version. Probability-weighted color
blending can wash out eyes and outlines. Avoid HSL and binary RGB, which ask three
questions per pixel. Keep probability painting as a separate experiment if the
basic portraits work.

## Proposed generation contract

Add an authenticated `POST /api/characters/[id]/avatar` route. It loads the
persisted character and returns `{ id, image }`. The client supplies no upstream
URL, model, questions, image markup, or character prompt in this request.

1. Verify the session and paid-account eligibility. Load only a private character
   owned by that user. Reject public presets and other users' IDs before calling
   Jev. Use the session-scoped Supabase client and existing RLS.
2. Return an existing valid generated avatar without another provider call.
   Reject attempts to replace another image through this create-only endpoint.
3. Apply a dedicated per-user avatar rate limit and acquire a short Redis lock
   for the character. Duplicate in-flight requests return a pending result;
   they do not call Jev again. Fail closed if these cost controls are unavailable.
4. Build state from the character name and one nonempty localized description.
   Prefer the validated current locale, then English, then another available
   description. Cap the combined visual brief at 800 characters. Treat it as
   descriptive data, not instructions to alter the request contract.
5. Request one centered head-and-shoulders portrait, a plain background, generous
   circular-crop margins, and no lettering. Supply grid dimensions and top-left
   coordinate rules. A name without a description produces a generic fictional
   portrait; do not send conversation transcripts or infer appearance from audio.
6. Ask one `choice` question per pixel using stable keys such as `x3_y7` and
   an explicit coordinate in every question's instructions. The provider does
   not see question IDs. Use a fixed, versioned palette with enough skin, hair,
   outline, and background colors for portraits.
7. Start with two concurrent palette batches of 144 and 112 questions for 16×16.
   Both receive the same state. Compare a single 256-question request in the
   benchmark; use it if context, quality, and latency support it.
8. Validate every expected answer and selected palette key. Validate any
   probabilities consumed as finite values in `[0, 1]`. Reject incomplete grids.
   Use a stable palette order to resolve ties; do not randomly sample on render.
9. Persist the encoded pixels only if the character still belongs to the user,
   remains private, has no image, and matches the `updated_at` value read before
   generation. A deleted or edited character must not receive stale output.
10. Return only the ID and image value. Record duration, actual model, token usage,
    and outcome without logging the brief, call instructions, or API key.

Use a six-second total generation deadline, including all batches. Abort sibling
requests on failure and release the Redis lock with a token-checked operation.
Give the lock a TTL longer than the deadline. Use no automatic upstream retries
in the first version; an explicit user retry passes the same rate limit.

## Storage and display

Store the result in `characters.image` as
`jev-palette-v1:<base64-packed-pixels>`. Version 1 defines a 16×16 grid and its
16-color palette. Two four-bit palette indices fit in each byte, so the grid is
128 bytes, or 172 Base64 characters before the prefix. The value contains neither
the description nor the provider response.

This keeps the avatar under the character row's existing access rules. Row deletion
also deletes the avatar. It needs no migration, R2 upload, public URL, image encoder,
or image-host configuration. A future format or palette change gets a new version.

Add a small shared codec in `apps/web/lib/character-avatar.ts` and a
`CharacterAvatar` component used by the selector. Validate the version, exact
decoded length, and encoding before rendering. Draw fixed-color React SVG cells
with a square viewBox and `shapeRendering="crispEdges"`. Keep the existing circular
crop and accessible character name. Never insert model-provided markup or use
`dangerouslySetInnerHTML`.

Existing image filenames keep their bundled-image rendering. Missing, malformed,
or unsupported generated values show the initials fallback. Persisting pixels
makes the portrait stable even if the provider model changes.

## Creation, failure, and editing behavior

After successful creation, show and select the character immediately. A shared
client coordinator starts the avatar request after the save completes. Both the
creation dialog and Save as new use it. Do not await avatar generation before
closing the dialog or enabling a call.

Patch only `image` on the matching character when the response arrives. Add an
image-only store action rather than replaying `SAVE_CUSTOM_CHARACTER`, which
also changes localized instructions. Ignore responses for deleted characters.
Keep pending and failed state in the client; do not add database status columns.

On timeout, rate limit, invalid response, missing key, or provider failure, leave
the saved character and initials intact. Offer a localized Generate avatar action
for an owned character without an image. Existing characters can use that action;
page loads must not automatically trigger paid generations. If the browser closes
or navigates away before completion, the fallback remains valid and the user can
retry. This version makes no guarantee of completion after navigation.

Keep an avatar through ordinary instruction, voice, name, and description edits.
Do not charge for another image on each save. Defer regeneration of an existing
avatar, uploads, style selectors, and automatic backfills.

Treat generation as an included paid-account capability without changing voice
credit balances. Start with five generation attempts per user per hour, including
retries, under a separate avatar limiter namespace. Reassess the limit using
measured usage. Do not reuse external API-key quotas for session-authenticated UI.

## Benchmark before application integration

Use synthetic briefs for at least 20 fictional characters, including short and
missing descriptions, different appearances, glasses and hats, robots, and the
six website languages. Compare 12×12 and 16×16 grids, with the same palette and
composition instructions. Compare pinned Jev 1.13 and 1.14, then select one model.

Render each result at 56 px and 64 px with the actual circular crop. Review face
legibility, description match, contrast, diversity, and crop safety. Reject grids
that look like noise, merged features, or indistinguishable portraits. Keep an
offline fixture set and a contact sheet with the selected model and request shape.

Measure provider latency separately from validation, persistence, and rendering.
Take at least 100 timings for the selected configuration, including cold route
starts. Target p50 at or below 1.5 seconds and p95 at or below 3 seconds for the
complete avatar request, with the six-second deadline as a fallback boundary.
These are product targets, not vendor promises.

Calculate provider cost from actual usage summed across requests:

```text
avatar_cost_usd = total_input_tokens / 1_000_000 * 0.042
```

For illustration, 20,000 input tokens cost $0.00084 and 50,000 cost $0.0021 at
the researched rate. Those token counts are hypothetical. Target less than
$0.002 per successful avatar, and report failed-attempt spend separately.
Check the current rate and account limits before running the benchmark.

If faces fail review, stop before UI integration and compare a small portrait-part
renderer. If quality passes but latency fails, test one batch or a 12×12 grid.
Do not compensate by adding a full painting engine or queue.

## Implementation sequence

1. Complete the benchmark and record the chosen model, grid, batching, palette,
   cost, and visual results in a proposed Agent Note under
   `.agents/notes/proposed/frontend/`. Keep fixtures synthetic.
2. Add the shared codec, question builder, response validation, and server-only
   TypeSafe client. Use native `fetch`; this single endpoint needs no new SDK.
3. Implement the owned-character generation route with rate limiting, duplicate
   suppression, cancellation, and conditional persistence. Add focused API tests.
4. Add the shared avatar component, image-only store update, creation coordinator,
   and Generate avatar action. Preserve initials while generation is pending.
5. Add any new UI keys to all six locale files. Document the image format and
   request behavior in `ARCHITECTURE.md`.
6. Configure server-only `TYPESAFE_API_KEY` for the web app. Its presence enables
   generation; absence leaves the fallback available. Update `AGENTS.md`,
   `README.md`, `apps/web/.env.example`, and `docs/devops.md` together. Distinguish
   runtime configuration from the GitHub Actions secret. Keep the model pinned
   in code rather than introducing another environment variable.
7. Verify in preview with a paid account, then enable production runtime access.
   Move the decision note to `implemented/frontend/` only when the feature ships.

## Verification and release criteria

- Test grid keys, coordinates, batch coverage, fixed palette ordering, encoding
  round trips, malformed data, missing answers, unknown colors, and cancellation.
- Test anonymous, unpaid, cross-user, public-preset, and missing-character requests.
  Verify rejected requests never call TypeSafe.
- Test duplicate requests, rate-limit exhaustion, unavailable Redis, cached images,
  provider errors, deleted rows, and concurrent edits. Failed generation must not
  alter the saved character or voice credits.
- Test both creation paths, immediate dialog close, successful image replacement,
  a failed request followed by explicit retry, persistence after reload, and
  initials on corrupt image data. Check that an image response cannot overwrite
  edited instructions or reinsert a deleted character.
- Run focused Vitest tests while implementing, then `pnpm fixall`,
  `pnpm type-check`, `pnpm test`, and `pnpm check-translations`. Run the focused
  call-dashboard Playwright scenarios for both creation paths.
- Check portraits in the mobile and desktop carousel at 56 px and 64 px.
  Accept the release only after the portrait and latency benchmark passes.
- For this plan-only change, format this Markdown file and run `git diff --check`.

Removing the runtime key stops new generation without affecting stored avatars,
calls, or character saves. The generated-image decoder and renderer must remain
available while stored `jev-palette-v1` values exist.
