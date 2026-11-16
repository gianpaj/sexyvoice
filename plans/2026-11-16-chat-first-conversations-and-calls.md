# Chat first, with an explicit voice call

Status: thread/message schema applied and verified in isolated local Supabase.
TanStack AI is selected for the new chat runtime. Customer token rates are
agreed; runtime integration and production rollout remain pending.
The [source review](2026-11-16-conversation-context-and-stream-recovery.md)
records the context, shared-memory, and durable-stream contracts.

The [TypeScript voice spike](2026-11-16-tanstack-nextjs-voice-spike.md) tests
whether Next.js can own the cascade voice runtime too. Its result determines
the runtime choice; the product, history, memory, and pricing contracts below
still apply. Sexyvoice owns these plans.

## Product brief

Open a character conversation as a mobile chat. Messages appear in chronological
order, with the newest at the bottom. A composer and Send button stay above the
phone keyboard. A phone button in the top right starts a voice call. Text replies
stream into the conversation. Chat spends credits according to token usage;
voice calls retain the existing minute rate.

The user selected separate chat and call modes and approved the earlier message
limits and retry policy. This plan replaces the
[in-call interleaving plan](2026-11-16-chat-interleaving-and-muted-audio.md).
The original issues remain useful research:
[Sexyvoice #700](https://github.com/gianpaj/sexyvoice/issues/700) and
[Sexycall #92](https://github.com/gianpaj/sexycall/issues/92).
This release does not complete their in-call typing capability.

## Decisions and assumptions for review

1. Chat opens without microphone permission, a LiveKit room, STT, or TTS.
   The phone button requests microphone access and starts the existing call flow.
   Ending a call returns to the same conversation.
2. One reply or call runs at a time per user. During a streamed reply, keep the
   phone button disabled. During a call, retain the existing call controls and
   disable text sending. Users can edit their draft while a text reply arrives.
3. Use one saved conversation for chat and call history. Carry recent messages
   into the call; import committed call turns before accepting the next text
   turn. Track stable threads for future navigation. Both modes use the existing
   Supabase memory under the saved preference; saved history and extracted
   memory remain separate records.
4. Charge completed chat generations from provider-reported input, cached input,
   and output tokens. The entire supplied context counts as input, including
   earlier messages. Reserve a bounded maximum before starting, then release
   the unused credits. Chat has no clock-based charge.
5. Once accepted, a reply may finish while the phone is temporarily offline.
   Save it and charge it once. Reconnect recovers that reply. It never creates
   another generation automatically. Include stream resumption with shared
   transport support. If the producer process dies or replay is unavailable,
   recover saved content and require an explicit retry after reconciliation.
6. Enforce the approved limits on both sides: 2,000 Unicode code points after
   trimming, one accepted new message per second, and one pending reply.
   Keep an unaccepted draft. Clear it after server acceptance. Show a failed
   message with an explicit Retry action; never silently resend.

Customer rates are 50 / 10 / 100 credits per 1,000 uncached input / cached input /
output tokens. Use decisions 2, 3, and 5 as the documented implementation
defaults: exclusive modes, shared history, and completing accepted replies after
a network drop. Missing final usage follows the failure policy below.

## Mobile experience

- Keep the existing character identity, colors, and typography. Change the
  conversation layout and entry flow. Avoid importing the template's model
  selector, tools, suggestions, reasoning display, attachments, or sidebar.
- Header: back navigation, character identity, top-right phone icon with the
  accessible label `Start call`. Use at least 44 by 44 CSS-pixel touch targets.
- Bottom-aligned message list: user messages on the right, character messages
  on the left. Maintain chronological DOM order; do not use `column-reverse`.
  Open saved history at the end. Prepending older messages preserves position.
- Follow incoming text only while the reader is at the bottom. Scrolling up
  stops following; a small `Latest messages` control returns to the end.
  Keyboard opening, orientation changes, and expanding streamed text must not
  pull someone away from the message they are reading.
- Show `Thinking…` from valid Send until the first visible assistant text,
  including metadata-only initial chunks. Restore that state for an active
  server operation after reload. On connection loss show `Reconnecting…`.
  Keep these indicators out of saved messages and do not expose model reasoning.
- Use dynamic viewport height, safe-area padding, and the existing page shell.
  Keep the composer visible with iOS and Android keyboards. Avoid nested page
  scrolling. The empty conversation keeps its composer at the bottom.
- Draft copy: `Message…`, `Send`, `Connecting…`, `Reconnecting…`,
  `Couldn't send. Try again.`, `Reply interrupted.`, and `Add credits to continue.`
  Show errors beside the affected message. Localize through existing messages.
- Keep Send disabled for empty input, offline state, rate limiting, a pending
  reply, and call transitions. Preserve drafts during permission denial, failed
  connection, and call return. Mobile Return inserts a newline; the visible Send
  button submits. Desktop Enter sends, Shift+Enter inserts a newline, and IME
  composition never submits accidentally.
- A new chat does not generate a paid greeting automatically. Its first model
  request follows the user's first Send. The call greeting should acknowledge
  continuation when chat history exists, without repeating the last answer.
- Show short pricing copy near the existing credit affordance:
  `Chat uses credits per token. Calls use credits per minute.` Link to the
  approved rates. Do not present a temporary reservation as a completed charge.

## Source review and runtime selection

Reviewed on 2026-11-16 against Sexyvoice
`e0b3f076bb19b09adfbf8f7648db436e4f29fd40` and Sexycall
`23cac3548c49c7aeeeb1f59ac57da761908bdf34`. Use TanStack AI for the new chat
client and Next.js route; Python retains LiveKit Agents.

| Source                                                                                                                                                                                                                                                                                                           | What to reuse or account for                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [shadcn AI Elements](https://ui.shadcn.com/docs/ai-elements)                                                                                                                                                                                                                                                     | Copy only the required visual patterns into the existing shadcn setup. Adapt them to TanStack message parts and state; do not import a second chat runtime through the template.                                                                                               |
| [Chat template](https://github.com/shadcn-ui/chatbot-template/blob/4106041b1bc9bab44e81ffd2764aa2b6f100e2b0/components/chat.tsx)                                                                                                                                                                                 | Reuse presentation and accessibility ideas. Its Vercel hook, stream format, and public unmetered endpoint are not our route contract.                                                                                                                                          |
| [Message Scroller](https://ui.shadcn.com/docs/components/base/message-scroller)                                                                                                                                                                                                                                  | Set `defaultScrollPosition="end"` and `autoScroll`. Omit user-turn anchoring near the top; keep chronological DOM order and preserve reading position.                                                                                                                         |
| [TanStack persistence](https://github.com/TanStack/ai/blob/22f7c73123ee02a39ed24e934a2ae872a7af2f29/docs/persistence/chat-persistence.md) and [store interfaces](https://github.com/TanStack/ai/blob/22f7c73123ee02a39ed24e934a2ae872a7af2f29/packages/ai-persistence/src/types.ts)                              | Separate threads, runs, and durable delivery. `saveThread` replaces the full authoritative message list. Supply ownership checks, transactional wallet admission, stale-writer protection, and a conforming relational adapter.                                                |
| [TanStack resumable streams](https://github.com/TanStack/ai/blob/22f7c73123ee02a39ed24e934a2ae872a7af2f29/docs/resumable-streams/overview.md) and [source contract](https://github.com/TanStack/ai/blob/22f7c73123ee02a39ed24e934a2ae872a7af2f29/packages/ai/src/stream-durability.ts)                           | Persist chunks before delivery, replay after an opaque offset, close terminal logs, and implement a finite snapshot. A reconnect can re-POST the handler, so side effects need idempotent admission before any provider call. Use a shared production log, not `memoryStream`. |
| [LiveKit text and transcription](https://docs.livekit.io/agents/multimodality/text/) and [chat context](https://docs.livekit.io/agents/logic/chat-context/)                                                                                                                                                      | Seed the voice session's history and collect committed turns. Text chat uses Next.js; `lk.chat` is unnecessary for separate modes.                                                                                                                                             |
| [LiveKit SDK input control](https://github.com/livekit/agents/blob/296f28b0198dea71211f9a5e5cb8187292ab896a/livekit-agents/livekit/agents/voice/io.py) and [RoomIO input](https://github.com/livekit/agents/blob/296f28b0198dea71211f9a5e5cb8187292ab896a/livekit-agents/livekit/agents/voice/room_io/_input.py) | Bind Python audio eligibility to the linked caller's actual microphone publication. Test forwarding with real SDK paths.                                                                                                                                                       |

The earlier plan records the inspected Grok example, React LiveKit starter, and
SDK 1.8.11 implementation details. Keep those references for microphone work.

Pin compatible published versions of `@tanstack/ai`, `@tanstack/ai-react`,
`@tanstack/ai-persistence`, and the Grok provider adapter when the runtime step
starts. The inspected `main` snapshot declares core 1.4.0, persistence 1.0.1,
and Grok adapter 1.1.1; source declarations do not prove registry availability.
Verify dist-tags and the selected release's APIs before installation. Respect
the workspace release-age policy and update the lockfile with dependencies.

Keep current Vercel AI SDK uses in `app/api/generate-text/route.ts`,
`components/audio-generator.tsx`, and `lib/ai/analyze-call.ts` outside the new
chat path. The generate-text endpoint annotates speech scripts; chat gets a
separate route. Upgrading those consumers is independent maintenance, not a
prerequisite for this schema slice. Do not broadly upgrade Next.js, React,
shadcn components, or Python dependencies for chat.

Normalize actual TanStack/Grok aggregate usage into total input, cached input,
and output once. Verify cache reporting, reasoning/output accounting, and final
versus aggregate usage with provider fixtures and one controlled real stream.
The cached count is a subset of total input. Do not reuse Vercel-specific usage
field names or sum cumulative stream reports as independent billable events.

## Conversation and backend contract

Next.js owns text generation, authentication, pricing, and chat settlement.
Python owns LiveKit calls and their existing minute metering. Supabase owns the
durable conversation shared between them. TanStack AI connects the browser to
the Next.js route; the Python server keeps LiveKit Agents.

The [context and recovery source review](2026-11-16-conversation-context-and-stream-recovery.md)
owns the detailed storage recommendation, handoff, memory lifecycle, transport
limits, and alternatives. Create relational conversations, messages, and
operations. A conversation records owner, character, scene, language, and
revision. Messages have a stable ID, role, text/voice source, sequence, validated
parts JSONB, completion/interruption state, revision, and source operation or
call-item ID. The first migration names the ordering column `position` and
stores only visible `{ type: "text", content: string }` parts. Operations store request ID, payload hash, history boundary, state,
model, rate version, reservation, usage, settlement status, and optional stream ID.
Link calls to their conversation and operation; keep legacy JSON snapshots.
Never expose internal prompts or provider credentials as message metadata.

Persist multiple historical threads per character. Reopen the most recent
compatible thread until a thread menu is added. A refresh or call does not
create a fresh thread. One active generation/call per user is the restriction;
idle thread records do not lock the account. Do not merge historical call JSON
into threads without a verified character/configuration mapping.

- `POST /api/chat`: accept conversation ID, stable request ID, and the new user
  text. Resolve ownership, character access, instructions, history, model,
  limits, and prices on the server. Ignore client-supplied assistant history,
  identity, balances, rates, and system instructions. Return TanStack's SSE
  events with stable thread, run/operation, and message IDs. Detect reconnects
  before all one-time admission, persistence, pricing, or provider work.
- `GET /api/conversations/:id`: return owned paginated messages and active
  operation state. Recover after refresh or a dropped response. Use server
  sequence and IDs to reconcile optimistic messages, never arrival time alone.
- `GET /api/chat/:id/stream`: authorize the thread, resolve its active operation,
  and resume that operation's stream. Replaying cannot append a user message,
  reserve credits, or invoke a provider. Bind opaque offsets to the owned run.
  Hydrate stored progress with its matching offset; replay only the missing
  suffix, or rebuild from the start when the snapshot cannot be aligned.
- Extend `/api/call-token` with optional conversation and operation IDs. The
  route verifies owner and character, obtains exclusive call admission, and
  signs identifiers into participant metadata. History stays in Supabase.
  Existing clients without a conversation retain their current voice behavior.
- Python parses the optional identifiers, revalidates their owner and admitted
  call, loads a bounded history snapshot, and seeds `chat_ctx` before starting
  providers. A linked call with unavailable history fails back to chat with a
  clear error. It must not silently start a disconnected conversation.
- Reuse existing server prompt resolution and paid custom-character checks
  for both modes. Keep the selected character and scene stable for a
  conversation; changing either starts a different conversation.

Implement narrow database operations for admission and finalization. Admission
serializes by user and checks both an active chat operation and active call,
including other tabs. Same request ID and same payload returns the existing
operation; a changed payload with that ID returns a conflict. Retries of an
accepted request bypass the new-message rate limit and cannot call the provider
again. Protect tables with ownership RLS and privileged-write boundaries.

Call-token requests must also be idempotent. An issued token has a bounded
startup lease; abandoned setup releases admission. Python claims it before
provider startup and ties its lifetime to the existing call heartbeat and
finalization. Delayed callbacks cannot release a newer operation's admission.
Use existing call cleanup rather than introducing another lock service.

Committed Python conversation events append idempotently using call ID and
SDK item ID. Seeded chat items must not be appended again or re-extracted as
new call speech. Preserve interrupted-message status and only the text the
SDK commits. Flush pending call turns and finish the conversation operation
before text sending resumes. A reconnect or delayed finalizer cannot reorder
or duplicate them. Retain current call transcripts and usage events.

Bound the model history, retaining character instructions and recent complete
turns. Fetch older UI history independently. Do not silently summarize with
another paid LLM request. Use `grok-4.20-0309-non-reasoning`, the cascade's
configured model, for text through TanStack AI and the existing server-side
`XAI_API_KEY`. Verify endpoint support, streaming, cached-token usage reporting,
and account access before paid rollout. Python keeps its LiveKit inference
path. Inworld remains the voice synthesizer; it does not generate text-chat
answers. A model change requires a separate rate version and cost review.

Use the same Python preload, hybrid retrieval, extraction, verification, and
embedding behavior for text and voice. The proposed backend interface lets
Next.js obtain bounded memory context without creating a LiveKit room. Persist
incremental, coalesced extraction work and checkpoints. Serialize memory writes
per user across call-end and chat work. Exclude seeded history and injected
prompts from new extraction evidence. Honor the saved memory opt-out and
invalidate queued work after memory deletion. A new thread does not clear shared
or character memory. The source review records the new API/worker deployment
work; no such service exists yet. Apply account/conversation deletion to message
and replay data. Exclude content from logs and telemetry.

## Token billing and credit safety

Use the agreed customer rate version `grok420-chat-v1`. Free and paid users
consume the same credits per token; purchase packages determine the cash paid
for those credits. Missing rates reject generation before provider spending.

| Token category | Credits per 1,000 tokens | Credits per million tokens | Tokens per credit |
| -------------- | -----------------------: | -------------------------: | ----------------: |
| Uncached input |                       50 |                     50,000 |                20 |
| Cached input   |                       10 |                     10,000 |               100 |
| Output         |                      100 |                    100,000 |                10 |

All supplied instructions and conversation history count as input. Cached
tokens are a subset of that input, not an additional input charge. The general
formula uses rates in credits per million tokens:

```text
uncached_input = input_tokens - cached_input_tokens
credits = ceil((uncached_input * input_rate
              + cached_input_tokens * cached_rate
              + output_tokens * output_rate) / 1_000_000)
```

For this rate version, use the equivalent integer calculation:

```text
credits = ceil((5 * uncached_input + cached_input_tokens + 10 * output_tokens) / 100)
        = ceil(uncached_input / 20 + cached_input_tokens / 100 + output_tokens / 10)
```

For nonnegative integer counts, `ceil(numerator / 100)` can be computed as
integer division of `numerator + 99` by 100. Round once per generation, after
combining all token categories. Do not round each category or charge in blocks
of 1,000 tokens. An actual all-zero usage result costs zero credits; missing
usage is a separate failure state.

Credits spent entirely on uncached input buy `credits * 20` tokens. Thus
10,000 credits buy up to 200,000 uncached input tokens in aggregate across
requests. Spent entirely on cached input, they buy 1,000,000 tokens; spent
entirely on output, they buy 100,000 tokens. A real exchange shares its budget
between the supplied context and the generated answer.

### Provider costs and worked examples

The estimates reviewed on 2026-11-16 use the global, short-context Grok 4.20
rates published by [xAI](https://docs.x.ai/developers/models/grok-4.20-non-reasoning)
and [LiveKit](https://livekit.com/pricing/inference):

| Token category | Provider USD per million tokens |
| -------------- | ------------------------------: |
| Uncached input |                           $1.25 |
| Cached input   |                           $0.20 |
| Output         |                           $2.50 |

```text
provider_usd = (1.25 * uncached_input + 0.20 * cached_input_tokens
                + 2.50 * output_tokens) / 1_000_000
```

The planned 16,384-input-token cap stays below xAI's 200,000-token long-context
threshold. These estimates exclude memory extraction/check calls and embeddings,
tools, media, hosting, replay/storage, payment fees, and regional API premiums.
Verify prices and endpoint choice before rollout. Include memory context itself
in the metered input tokens and in the reservation budget.

| Example exchange                               | Grok cost | Customer credits | Customer USD at the base Standard pack |
| ---------------------------------------------- | --------: | ---------------: | -------------------------------------: |
| 2,000 uncached input + 200 output              |    $0.003 |              120 |                                 $0.048 |
| 5,000 uncached input + 300 output              |    $0.007 |              280 |                                 $0.112 |
| 500 uncached + 4,500 cached input + 300 output | $0.002275 |              100 |                                 $0.040 |
| 16,000 uncached input + 500 output             |  $0.02125 |              850 |                                 $0.340 |

The configured base Standard pack is $10 for 25,000 credits, or $0.0004 per
credit. Pro is $75 for 300,000 credits; its normal subscription adds 15%, giving
345,000 credits for $75. Those subscription credits leave 88.5% margin over
uncached input/output model costs at the agreed rates, before other costs and
promotions. These are assumptions from Sexyvoice's `lib/stripe/pricing.ts`;
deployment promotions and first-month discounts can change realized revenue.

### The free 10,000-credit grant

An exchange means one user message and one model reply. Input includes the
character prompt and earlier turns, so there is no fixed number of messages
per grant.

At the proposed maximum of 16,384 entirely uncached input tokens and 1,024
output tokens, one exchange uses 922 credits and costs $0.02304. Ten such
exchanges use 9,220 credits and cost $0.2304, leaving 780 credits. Admission
must let a smaller affordable exchange use that remainder. For example,
14,000 uncached input tokens and an 800-token reply cost exactly 780 credits
and $0.0195, bringing the total to 10,000 credits and $0.2499.

For tokens covered by settled credits, input and output cost at most $0.000025
per credit; cached input costs $0.000020 per credit. Rounding up can only reduce
the provider cost per credit. Therefore a fully spent text-only grant covers
at most $0.25 in metered Grok usage, or $250 for 1,000 fully spent grants.
Calls and other features consume the same wallet under their own rates.

This is a bound on metered token usage, not an unconditional provider-spend
cap. Failed provider attempts that are refunded or have unreported usage can
add spend without consuming customer credits. Record known failed-attempt
costs, keep unknown costs unknown, and observe these separately. The estimate
must not be presented as a hard acquisition-cost guarantee.

A growing-conversation example uses a 1,500-token character prompt, 50-token
user messages, and 150-token answers. The nth exchange supplies
`1,500 + 50*n + 150*(n-1)` input tokens. For the cache example, the first
request misses; subsequent requests reuse the entire earlier request prefix
and have 200 uncached tokens. Round customer credits once on each exchange.

| Modeled 50-exchange conversation    |  Grok cost | Credits used | Exchanges covered by the free grant |
| ----------------------------------- | ---------: | -----------: | ----------------------------------- |
| No cache hits                       |  $0.421875 |       16,900 | 36, using 9,648 credits             |
| All earlier request prefixes cached | $0.0951675 |        4,454 | All 50, with 5,546 credits left     |

These are reproducible estimates, not promised trial lengths. Prefix changes,
eviction, and routing can reduce hits. Use per-conversation routing and stable
prefixes where supported; charge cached prices only for provider-reported hits.
See [xAI caching behavior](https://docs.x.ai/developers/advanced-api-usage/prompt-caching/how-it-works).

### Reservation and settlement

Validate nonnegative counts and cached input no greater than total input.
Provider cost remains a separate USD estimate using provider prices. The
existing `calculateCreditsFromTokens()` ratio of 1.1 prices Gemini speech;
do not reuse it for chat. Any reasoning tokens already included in output
must not be counted again. Use decimal or integer arithmetic and round once
per generation. Record the rate version with usage.

Before provider invocation, atomically reserve a conservative, bounded maximum
from the existing wallet and persist the accepted user message and operation.
Cap total supplied input and output. Provisional limits are 16,384 input tokens,
1,024 output tokens, and 60 seconds; validate them against real prompts and
deployment duration before release. A server-side tokenizer or validated
conservative bound must cover serialized input and provider overhead. A client
estimate cannot enforce the wallet. Fit retained context and the output cap to
the available balance; 922 credits is a maximum reservation, not a minimum
balance for every message. Preserve character instructions and recent complete
turns. If those and a useful bounded reply cannot fit, reject before spending.
The 780-credit remainder case above is a required admission test.

On authoritative completion, atomically persist the reply, finalize actual
usage, return unused reserved credits, and insert one `text_chat` usage event.
Extend usage enums with `text_chat` and `tokens`, and store token breakdowns.
Respect existing balance triggers and the split between `credit_transactions`
and append-only `usage_events`. Reservation release and settlement retries must
not double-adjust either. Integrate chat usage into existing history/summary
queries and preserve zero-credit accounting where appropriate.

Failure policy proposed for approval: rejection before acceptance is free.
Accepted work with authoritative usage bills that usage once, including a
saved partial answer. If final usage is unavailable, retain the partial answer,
mark provider cost unknown, and release the reservation without inventing a
token charge. A bounded reconciliation job handles crashed or expired work.
If an authoritative settlement committed but its acknowledgement was lost,
reconciliation must recover it rather than refunding it again.

Call admission waits for chat settlement. During voice, the existing minute
clock applies, including microphone mute. Model-internal voice tokens are not
also charged as chat tokens. A failed call follows existing first-speech and
credit-waiver rules. Text chat neither creates a `call_sessions` row nor starts
the voice billing clock.

## Network recovery and audio boundaries

Keep request IDs until server acceptance is known. An ambiguous POST failure
first checks operation state; Retry reuses the same ID and payload while
acceptance is uncertain. Offline drafts are not queued for automatic delivery.
After a confirmed terminal generation failure, an explicit retry creates a new
operation referencing the existing user message. It can incur a new token
charge, and must not duplicate that user message. A deliberately new message
also gets a new ID. Each accepted operation starts at most one generation and
settles at most one charge.

Drain an accepted stream independently of browser disconnect, within the
function's supported execution lifetime. Persist partial progress at bounded
intervals and always persist the final state. The route's deadline must fit
inside the host's timeout. This is bounded continuation, not a guarantee that a
server process survives. On crash, reconcile expired work and release admission.

After reconnect, load owned history and the active operation, then attach to
its per-run durable log through an authorized GET. TanStack's live HTTP
reconnect may re-POST; route both replay paths through ownership and idempotency
checks before any one-time work. Never start another provider request to replay.
Pair each saved partial message with its matching delivery offset, or rebuild
the assistant message from the log's start. A snapshot plus an unrelated cursor
can duplicate or skip text. Completed messages remain in Supabase after bounded
transport-log retention expires. A producer crash stops generation; replay the
stored prefix, reconcile its billing and admission, and require explicit Retry.

Do not mount `LiveKitRoom`, request media, fetch call tokens, or dispatch an agent
in chat. Permission denial and call setup failures return to the same draft and
history. After hangup, unpublish/stop microphone capture and disconnect the room.
Keep chat disabled only until the server confirms final call turns and billing.

Within voice, retain `stopMicTrackOnMute: true`. Bind Python input eligibility
to the linked caller's microphone publication across startup, mute, unpublish,
replacement, and reconnect. Disable input when publication state is unknown.
Ignore other participants and playback mute. Test that no new frames reach STT
after the gate applies; already-forwarded speech can still complete. Do not
promise zero idle STT provider spend from mute alone.

## Implementation sequence and checks

1. **Verified locally:** thread/message tables, optional call link, generated
   Supabase types, and pgTAP coverage for RLS, immutable IDs, ordering, source
   deduplication, revisions, visible parts, call ownership, deletion, and legacy
   compatibility. The isolated database passes all 130 assertions across eight
   suites, including the 48 conversation assertions.
2. Add TanStack runtime dependencies, a relational persistence adapter, and a
   shared durable-delivery adapter. Run the package conformance tests against
   the chosen stores. Add operations/run admission and log migrations together
   with transaction tests; do not create separate competing run/operation
   authorities. Preserve full-transcript replacement semantics and reject stale
   writers. Include exclusive user admission, duplicate requests, memory work,
   usage reservations, settlement, refunds, and expired work. Add pure pricing
   tests for the agreed rates, conversion, rounding, and trial examples.
3. Add failing Next.js route tests, then implement authoritative history,
   streamed generation, authorized offset replay, operation recovery, rate
   limits, and token billing. Test re-POST replay, missing/expired logs, and
   producer death. Use real TanStack events with deterministic fake providers.
4. Build the mobile conversation from the selected shadcn visual patterns.
   Adapt components to TanStack `useChat` and verify hydration and waiting states.
   Preserve the existing call view and selection controls.
5. Add Python tests before changing core session behavior. Implement optional
   history loading, idempotent turn persistence, continuation opening, and
   finalization. Cover session replacement and seeded-history filtering. Expose
   the shared memory interface, implement coalesced extraction/checkpoint work,
   and serialize chat/call memory writes. Test opt-out and deletion races.
6. Add microphone-gate regression tests using the pinned SDK, synthetic audio,
   delayed STT finals, and fake providers. Implement the gate on both session
   start and replacement. Keep the default Grok path and existing billing stable.
7. Run a cross-repository integration harness with real Next.js routes,
   migrated local Supabase, a shared durable log, a LiveKit test room, Python
   memory interface, and the call worker. Stub providers; exercise the actual
   handoff, authentication, wallet, memory work, replay, and transcript writes.
   Assert database records as well as UI behavior.
8. Run mobile browser tests and controlled provider smoke tests, then open
   paired ready PRs with the contract and actual validation results. Deploy
   compatible database and Python support before exposing linked calls in the
   frontend. Enable paid chat only after the pricing, usage-reporting,
   reservation, settlement, and recovery gates pass.

## Readiness for the first implementation

The repository includes the conversation-history foundation:

- `apps/web/supabase/migrations/20261116140000_create_conversations.sql`
- `apps/web/supabase/tests/conversations.test.sql`
- `apps/web/lib/supabase/types.d.ts`, generated from the applied local schema
- `.agents/notes/proposed/database/2026-11-16-conversation-history.md`

The migration contains conversation history, visible text parts, revisions,
and protected call links. Paid chat and stream replay require runtime work.
Validation against an isolated local database passed eight pgTAP files and
130 assertions, including 48 conversation assertions. Production is unchanged.

For a local Supabase project started by the developer, the developer applies
pending migrations from `apps/web`:

```sh
supabase db push --local
```

After the migrations are applied, run the repository checks from its root:

```sh
pnpm test:db
pnpm generate-supabase-types:local
```

Use the project's configured local ports. If another worktree owns those ports,
create an isolated local project using Supabase's workdir/configuration options
and pass its `--workdir` to the database tasks. No maintainer-local script is
required. Follow [AGENTS.md](../AGENTS.md): agents do not apply migrations.

TanStack adapters, billing transactions, Python handoff, and mobile/network
behavior require their runtime tests. The schema alone establishes none of
those behaviors.

These prerequisites remain for the later runtime and paid rollout:

- Verify published TanStack package contracts and the persistence/durability
  adapters. The source review records atomic full-transcript replacement,
  finite log snapshots, opaque offsets, re-POST replay, and SDK run statuses.
- Prove a conservative input-token bound and balance-aware context/output
  limits, including serialization overhead, before reserving credits.
- Verify the xAI model endpoint and credentials using one controlled stream
  with real final usage and cache reporting. Reuse `XAI_API_KEY`; live account
  access and the selected adapter's usage fields are not yet tested.
- Specify an atomic per-user chat/call admission, settlement protocol, and
  expired-operation reconciler. Do not enable payment based on schema alone.
- Prove accepted generations drain and settle after disconnect within the host
  timeout. Durable delivery cannot revive a terminated provider request.
- Validate the shared production log backend, its retention/deletion behavior,
  and the authenticated Python memory API/worker deployment. Dependencies do
  not prove account configuration or production reachability.
- Bring up local Supabase/LiveKit/Python integration and check iOS Safari and
  Android Chrome before claiming mobile call recovery works.

## Required test matrix

| Layer                            | Cases and assertions                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database and pricing             | Cached-token subtraction, rounding, zero/absent usage, invalid usage, insufficient funds, maximum output, two tabs sharing a wallet, duplicate finalizers, lost settlement acknowledgement, expired reservations, ownership and deletion. Exactly one charge per accepted generation.                                                                                                                                               |
| Next.js                          | Unauthenticated/foreign conversations, custom-character entitlement, forged history or prices, invalid JSON, Unicode limit, 429, duplicate POST, changed payload for an ID, provider error before and after first text, usage-only final chunk, and finalization after client disconnect. Verify genuine incremental delivery before completion.                                                                                    |
| Mobile components                | Empty chat, short and long history, streaming bubble, draft editing, bottom following, scroll-up hold, prepend pagination, keyboard resize, safe areas, rotation, IME, accessibility, translated copy, credit errors, and disabled Send/phone states.                                                                                                                                                                               |
| Poor networks                    | Slow first byte, delayed/jittered chunks, offline before Send, acceptance with lost response, mid-stream disconnect, reload, background/foreground, rapid online/offline changes, failed status requests, and reconnect after completion. No automatic duplicate generation or charge; drafts and saved replies remain recoverable. Explicit retry after terminal failure creates one new operation and preserves one user message. |
| Resumable delivery               | Authorized GET and idempotent re-POST, replay after refresh and background return, identical assistant ID, aligned offset replay without duplicated text, second observer, producer crash, durable-log failure, expired/missing replay, completion during resume, and stale cleanup after a newer operation. Resume never starts a provider or charge.                                                                              |
| Shared memory and waiting states | Text facts available to voice and voice facts to text; existing shared/character scopes, opt-out, failed retrieval, incremental checkpoints, serialized corrections, deletion with queued work, and seeded-history exclusion. Thinking indicator before visible text, metadata-first streams, reload, reconnect, empty response, and terminal failure.                                                                              |
| Chat/call handoff                | Text reply completes then call, phone pressed during reply, double-tap call, denied/revoked mic permission, token fetch failure, worker startup failure, hangup during startup, linked history load failure, ordinary hangup, credit exhaustion, delayed transcript flush, reconnect, and call in another tab. Return to the same conversation.                                                                                     |
| Python audio                     | Startup muted, mute during speech, track loss, replacement while muted, reconnect muted, unmute, other-participant events, and playback mute. Count actual forwarded frames at the STT boundary and ensure muted audio is never replayed.                                                                                                                                                                                           |
| Provider smoke tests             | Inworld cascade and production Grok calls with seeded chat, continuation greeting, transcript return, sustained mute for at least two minutes, and unmute. Verify one actual text stream with real usage. Include Mistral shared-path regression; the experimental Inworld realtime spike remains experimental.                                                                                                                     |

Run mobile Playwright coverage for Chromium and WebKit at phone sizes. Inject
latency, chunk delays, disconnects, and offline state deterministically; bandwidth
throttling alone does not cover these failures. Check iOS Safari and Android
Chrome on real devices for keyboard, audio permissions, and background behavior.
Browser emulation is not evidence of operating-system microphone behavior.

Sexyvoice requires `pnpm fixall`, `pnpm type-check`, applicable `pnpm test`,
`pnpm check-translations`, Playwright cases, and `pnpm test:db` after migrations
are applied. Sexycall requires `uv run ruff check`, `uv run ruff format --check`,
and `uv run pytest`. Run opener evals if changing opening prompts. Run memory
live tests only if extraction/check prompts or models change. Report live tests
separately; mocked E2E call tokens do not verify Python integration.

## Completion criteria

A phone user can open chat without media permission, send a message, see a
streamed answer, lose connectivity, recover it without another charge, start a
call with that context, mute safely, hang up, and continue by text with the call
turns present. Token credits and minute credits reconcile independently in the
same wallet. Resume the active reply without another generation or charge.
Enabled long-term memory reads and writes work across both modes. Saved threads
remain available for future navigation. Reconnect and repeated taps cannot
start duplicate generations, extra calls, or hidden audio sessions.

The decision record is the
[proposed Agent Note](../.agents/notes/proposed/feature/2026-11-16-chat-first-conversations.md).
