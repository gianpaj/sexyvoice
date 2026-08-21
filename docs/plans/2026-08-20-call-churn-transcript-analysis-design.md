# Design: Transcript-driven churn analysis for voice calls

Status: proposal
Related: [sexycall#55](https://github.com/gianpaj/sexycall/issues/55)
(event-level telemetry), [sexyvoice#526](https://github.com/gianpaj/sexyvoice/issues/526) (closed, refiled as
sexycall#55)

The second half of this document is a first-principles review of sexycall#55
itself: [what holds, what doesn't, and what to actually build](#review-of-sexycall55--can-we-and-should-we).

## The question we are trying to answer

> When a paying user says *"No, that's not what I meant"* or *"Why are you doing
> this?"* — what went wrong, and is that what made them stop calling?

This is deliberately narrower than the existing analysis. `call_session_analysis`
already tells us *what a call was about* (topic, language, engagement). It does
not tell us *what broke*, *who broke it*, or *whether the user ever came back*.

The unit of analysis here is not the call. It is the **friction event**: a
specific user turn where the user pushed back on the AI, plus the AI turn that
caused it, plus what happened next.

## What already exists

| Piece | Location | Notes |
| --- | --- | --- |
| Transcript capture | `sexycall:src/transcript_collector.py` | Writes `{room_name, start_time, end_time, messages[], user_transcriptions[]}` to `call_sessions.transcript`; every turn carries an ISO timestamp |
| Per-call LLM analysis | `apps/web/lib/ai/analyze-call.ts` | Grok structured output → `call_session_analysis` |
| Batch/backfill runner | `scripts/analyze-call-sessions.mjs` (1078 LOC) | xAI Batch API, paging, CSV + insights JSON output, dry-run mode |
| Webhook trigger | `apps/web/supabase/migrations/20260703000000_add_call_session_analysis.sql` | pg_net POST to `/api/call-sessions/analyze` on transition to `completed` |
| Aggregate rows | `call_session_analytics` | One row per analysis run |

The runner is the right host for this work. It already solves batching, paging,
retries, cost control and CSV output — we should extend it, not start over.

## Blockers to fix before the first batch runs

These are ordered by how badly they corrupt the specific answer we want. Items
1–3 are correctness bugs in the current pipeline; 4–6 are scope gaps.

### 1. Every user turn is fed to the model twice

`transcript_collector.add_user_transcription()` appends the user turn to **both**
`self.messages` and `self.user_transcriptions`
(`sexycall:src/transcript_collector.py:104-124`). `to_dict()` serialises both
lists.

`extractMessages()` — in `apps/web/lib/ai/analyze-call.ts:110` and identically in
`scripts/analyze-call-sessions.mjs:340` — treats `transcript.messages` as
assistant-only and then concatenates `transcript.user_transcriptions` on top. It
does not de-duplicate.

Result: in every production transcript, each user line appears twice in the
prompt, and `userMessageCount` is inflated ~2×.

This is fatal for *this* analysis specifically. Duplicated user turns look
exactly like a user repeating themselves — which is our primary frustration
signal. We would be measuring our own bug.

The unit test that covers this (`apps/web/tests/analyze-call.test.ts:54`) passes
a `messages` array containing only an assistant turn, which is not the shape the
agent actually writes.

**Fix:** de-duplicate on `(role, content, timestamp)`, preferring `messages` as
the ordered spine and using `user_transcriptions` only to recover the per-turn
`language` field and to backfill user turns when `messages` is a bare array.
Update the test to use a realistic transcript fixture.

**Verify first:** count, over the sample, how many transcripts have
`messages.filter(role==='user').length === user_transcriptions.length`. If that
holds broadly, the duplication is confirmed and universal.

### 2. Calls under 120 seconds are excluded

`MIN_ANALYSIS_CALL_DURATION_SECONDS = 120` is applied in the fetch query
(`scripts/analyze-call-sessions.mjs:194`, and again in the webhook route).

A paying user who hangs up 25 seconds into a bad call is the single highest-value
churn signal we have, and is currently invisible. The threshold makes sense for
"what are people into" analytics; it is exactly backwards for failure analysis.

**Fix:** make the floor a CLI flag (`--min-duration=0`) rather than a constant,
for this analysis path.

### 3. Only `status = 'completed'` is analysed

The fetch also filters `.eq('status','completed')`. Sessions that ended as
`error` or `disconnected` — the actual failures the issue asks about — are never
looked at.

**Fix:** `--statuses=completed,disconnected,error`.

### 4. There is no "did they come back" label anywhere

Nothing in `call_sessions` or `call_session_analysis` says whether a call was the
user's last. Without it, "why they churn" is not answerable — only "what
annoyed them" is.

**Fix:** derive it at query time (below). No schema change needed.

### 5. `where_died` is free text

`call_session_analysis.where_died` is a free-form sentence, so it cannot be
grouped, counted, or ranked. Same for `ai_issues`. We can read them one by one;
we cannot say "38% of exit calls ended on X".

**Fix:** the new friction schema is enum-first, with the free text kept as
supporting evidence rather than as the primary field.

### 6. Some calls may have no user transcription at all

The existing prompt already instructs the model to handle "missing user
transcription", so this is a known condition, but its frequency is unmeasured.

Every question in this analysis depends on user turns existing. **Quantify this
before drawing any conclusion**: report `% of sampled calls with zero user
turns`, split by language. If it is high, that is the finding — and it is a
bigger one than anything the transcripts could tell us, because it means we are
half-deaf on our own calls.

## Methodology

### Cohort: paid users, with a contrast set

"Paid user" = has at least one `credit_transactions` row of type `purchase` or
`topup`. This matches `scripts/analyze-free-users.mjs:64`.

The important design decision: **do not only look at the last calls of churned
users.** Every call contains some friction. Reading only exit calls guarantees we
find something and guarantees we cannot tell whether it matters.

Sample two sets from the same population and diff them:

- **Exit calls** — the last call before a gap of ≥ 30 days (or before now, if the
  user never returned).
- **Retained calls** — a call followed by another call from the same user within
  3 days.

A friction type only explains churn if it is meaningfully over-represented in the
exit set.

```sql
-- Cohort + churn labelling. Read-only; run against prod with the service role.
with paid_users as (
  select distinct user_id
  from public.credit_transactions
  where type in ('purchase', 'topup')
),
labelled as (
  select
    cs.id,
    cs.user_id,
    cs.started_at,
    cs.ended_at,
    cs.duration_seconds,
    cs.status,
    cs.end_reason,
    cs.credits_used,
    lead(cs.started_at) over (
      partition by cs.user_id order by cs.started_at
    ) as next_call_at,
    row_number() over (
      partition by cs.user_id order by cs.started_at desc
    ) as recency_rank
  from public.call_sessions cs
  join paid_users pu on pu.user_id = cs.user_id
)
select
  *,
  next_call_at is null as is_last_call,
  case
    when next_call_at is null then null
    else extract(epoch from (next_call_at - started_at)) / 86400
  end as days_to_next_call,
  case
    when next_call_at is null and started_at < now() - interval '30 days'
      then 'exit'
    when next_call_at is not null
     and next_call_at - started_at <= interval '3 days'
      then 'retained'
    else 'ambiguous'
  end as cohort
from labelled
where recency_rank <= 5      -- last handful per user
order by user_id, started_at desc;
```

Start with the top ~20 paid users by total minutes whose last call is more than
14 days old — per sexycall#55, four of the top ten have already gone silent and
represent ~30% of all minutes ever recorded. Those are the transcripts to read.

### Pass A — deterministic signals (no LLM)

Cheap, exact, and computable from data we already store. Run this first; it may
answer the question without any model spend.

Per call:

- Turn counts after de-duplication; user:assistant turn ratio.
- **Gap distribution** — `assistant[i].timestamp − user[i-1].timestamp`, p50/p95.
- **Trailing gap** — `ended_at − last_message.timestamp`. A long trailing gap
  after an AI turn means the user went silent and left mid-scene; a short one
  after a user turn means they hung up on a reply.
- **Repetition** — near-identical consecutive assistant turns (normalised
  Levenshtein > 0.9), a proxy for loops.
- **Language mismatch** — `user_transcriptions[].language` vs the language of the
  assistant turns. Given DE ≈ 30% and IT ≈ 13% of traffic, this is a prime
  suspect and completely uninstrumented today.
- **Zero-user-turn flag** — see blocker 6.
- **Shutdown-message tail** — did the call end on a `credit_limit` /
  `duration_limit` / `billing_error` system message
  (`sexycall:src/agent.py:235`)? Being cut off mid-scene by our own biller is a
  churn hypothesis that costs nothing to test.
- **Refusal end** — `end_reason = 'instructions_rejected'`
  (`sexycall:src/agent.py:102`).

**Caveat on latency, stated plainly:** assistant turns are timestamped when
`conversation_item_added` fires (`sexycall:src/agent.py:1679`), i.e. when the
message is committed — not when the first audio byte reaches the user. These
gaps bound *conversational* dead air; they are not time-to-first-audio. Real TTFA
p95 needs the `call_turns` table proposed in sexycall#55. Do not report these
numbers as latency.

### Pass A2 — repair-phrase lexicon

A regex sweep over user turns in all six locales, tuned for recall, used to
*locate* candidate moments rather than to classify them:

- Correction: "that's not what I meant", "no, I said", "das meinte ich nicht",
  "non è quello che intendevo", "ce n'est pas ce que je voulais", "no me refería"
- Challenge: "why are you doing this", "why did you say that", "warum machst du das"
- Repetition: "I said", "again", "nochmal", "otra vez", "ancora"
- Presence check: "hello?", "are you there", "can you hear me", "bist du noch da"
- Stop: "stop", "wait", "shut up", "halt", "basta", "arrête"
- Persona break: "you're a robot", "you sound like", "sei un robot"

Every hit is a candidate friction event with a verbatim quote and turn index.
This gives us hard counts and exact quotes cheaply, and gives the LLM pass
something to be checked against.

### Pass B — LLM friction extraction

Reuse the existing xAI Batch path in `scripts/analyze-call-sessions.mjs` (async,
discounted, no per-request rate limits). New prompt, new schema — the goal is
enumerable events, not prose.

```ts
const frictionEventSchema = z.object({
  turn_index: z.number(),
  user_quote: z.string(),             // verbatim, for the report
  ai_turn_quote: z.string().nullable(), // the AI turn that provoked it
  type: z.enum([
    'asr_misheard',        // AI answered something the user didn't say
    'instruction_ignored', // user asked for X, AI kept doing not-X
    'persona_break',       // dropped character / "as an AI"
    'refusal',             // declined content mid-scene
    'repetition_loop',     // same reply again
    'dead_air',            // user checking whether it's alive
    'wrong_language',      // replied in the wrong language
    'memory_failure',      // forgot a name/fact set earlier
    'voice_quality',       // too loud, robotic, wrong gender, mispronunciation
    'interruption_failure',// user spoke, AI talked over them
    'pacing_mismatch',     // monologue / too fast / too talkative
    'content_mismatch',    // steered to a different scenario than asked
    'billing_interrupt',   // our own credit/duration cutoff ended the scene
  ]),
  severity: z.enum([
    'mild',     // user rephrases and carries on
    'moderate', // user complains explicitly
    'terminal', // call ends within 2 turns of this
  ]),
  ai_recovered: z.enum(['recovered', 'partial', 'never']),
});

const callFrictionSchema = z.object({
  friction_events: z.array(frictionEventSchema),
  terminal_friction_type: z.string().nullable(), // the one preceding the end
  last_user_turn_verbatim: z.string().nullable(),
  user_exit_state: z.enum([
    'satisfied', 'resigned', 'angry', 'bored', 'abandoned_mid_turn', 'cut_off_by_system',
  ]),
  churn_explanation_confidence: z.enum(['none', 'weak', 'moderate', 'strong']),
  churn_hypothesis: z.string().nullable(),       // one sentence, evidence-bound
});
```

Prompt rules that matter: quote verbatim, never paraphrase; if the transcript
does not support a friction event, return an empty array (the model must be
allowed to find nothing); when user turns are absent, say so and return
`confidence: 'none'` rather than inferring from the AI side.

Keep `experimental_telemetry` disabled exactly as `analyze-call.ts:196` does —
these prompts embed verbatim intimate transcripts and must never reach Sentry.

### Pass C — per-user exit narrative

Roll the last ~5 calls of each churned paid user into one short brief:

- Call-by-call: duration, end reason, friction types, exit state.
- Trend: are their calls getting shorter? Is the same friction type recurring?
- The final call verbatim: last three user turns and the AI turns around them.
- One-line hypothesis, with the confidence the evidence actually supports.

This is the artefact to actually read. Twenty of these is a morning's reading and
is worth more than any aggregate at this sample size.

## Phasing

**Phase 0 — one-off batch, no schema change (do this first).**
New script `scripts/analyze-call-churn.mjs`, importing the existing helpers from
`analyze-call-sessions.mjs` (client creation, batch submission, paging, CSV).
Fix blocker 1 in the shared `extractMessages` so both paths benefit. Flags:
`--users=paid`, `--last-n=5`, `--min-duration=0`,
`--statuses=completed,disconnected,error`, `--cohort=exit|retained|both`,
`--dry-run`. Output: CSV + insights JSON + a markdown brief per user, written
locally. Nothing is written to the database.

Deliverable: a ranked table of friction types split by exit vs retained cohort,
plus ~20 per-user briefs.

**Phase 1 — productionise, only if Phase 0 finds a signal worth tracking.**
Add `call_session_friction_events` (one row per event, FK to `call_sessions`,
enum type/severity, RLS on, service-role only) so friction becomes groupable over
time. Migration to be written by us and **applied by you** — per `CLAUDE.md`,
agents don't run migrations.

**Phase 2 — close the loop with sexycall#55.**
Phases 0 and 1 are transcript archaeology: they infer what happened from text.
The `end_reason` taxonomy and `call_turns` latency instrumentation in sexycall#55
are what let us *measure* it. Phase 0 should sharpen that issue: it will tell us
which friction types are frequent enough to be worth instrumenting, so the
telemetry work is aimed rather than speculative.

## What this can and cannot establish

Worth being blunt about, so the first report isn't over-read:

- At ~430 calls over 90 days and a handful of churned paid users, this is
  **qualitative hypothesis generation**, not statistics. No p-values.
- Transcripts cannot see what users heard. Voice quality, cut-off audio, volume
  and latency are invisible except where the user complains about them in words.
- Correlation only. The last call before someone leaves is not necessarily the
  reason they left — they may have been done anyway. The exit-vs-retained
  contrast set is what keeps this honest, and it is still weak evidence.
- The most likely honest outcome of Phase 0 is a short list of *testable*
  hypotheses plus one or two data-quality findings (blockers 1 and 6 are already
  candidates).

## Privacy

Same constraints as the existing pipeline, plus one new one: this analysis
extracts and stores **verbatim user quotes**, which the current schema does not.

- No transcripts or quotes in Sentry, Axiom, or any telemetry that leaves our
  infrastructure (`experimental_telemetry: { isEnabled: false }`).
- Per-user briefs are local files containing intimate verbatim content — treat
  them as production data: do not commit them, and delete them when done. Add
  the output glob to `.gitignore`.
- If Phase 1 stores quotes, they must be covered by the privacy policy and
  removed by the account-deletion flow, matching the note in sexycall#55.
- Reference users by `user_id` in any shared write-up. Never by email.

## Open questions

1. **Which window?** Last 5 calls per paid user, or every call from paid users in
   the last 90 days? The latter is a few hundred calls — affordable on the Batch
   API and gives the contrast set real weight.
2. **Voice/character breakdown?** sexycall#55 notes `Unknown` character names are
   growing and that ~85–90% of calls on the top three scenes are customised. If
   custom characters correlate with friction, that changes the product answer
   entirely — but it needs the character join fixed first.
3. Should Phase 0 write anything to the DB, or stay entirely file-based?
   Recommendation: file-based, so we can iterate on the schema without
   migrations.

---

# Review of sexycall#55 — can we, and should we?

The issue asks for a first-principles review. Verdict: **the motivation is right,
the diagnosis is wrong, and about a third of the spec cannot be built as written
on our current architecture.** It should be split into four independently
shippable pieces, in the order below.

## The core inversion

The stated motivation is: *our top user left and we have no data explaining why.*
The proposed remedy is 30 new fields captured on *future* calls.

Those are different problems. Instrumentation prevents future blindness. It tells
us nothing about the four users who have already gone. And we are not actually
dataless about them — we have **their full transcripts**, already stored in
`call_sessions.transcript`, already timestamped per turn, and largely unread.

So: read the transcripts first (the plan above), then instrument what reading
them proves is worth instrumenting. That ordering costs days instead of weeks and
makes the telemetry work aimed rather than speculative.

## Claims in the issue that don't hold

**"Currently a 25-second call and a 25-second crash are indistinguishable."**
Not true. `call_sessions.end_reason` exists today
(`20251219000000_create_call_sessions.sql`) and is populated by the agent with
`user_disconnect`, `credit_limit`, `duration_limit`, `billing_error`,
`instructions_rejected`, `error`, `agent_unavailable`, `timeout`. What is true is
that this taxonomy is undocumented, nullable, has no `unknown` default, and
differs from the one proposed. That is a hardening job, not a new column.

**"`scene_id` should already exist."** Half true, and the half that's missing is
the interesting one. `character_id`, `scene_id` and `scene_modified` are all
captured — the web app puts them in the LiveKit token metadata
(`apps/web/app/api/call-token/route.ts:238`) and the agent persists them into
`call_sessions.metadata` (`sexycall:src/agent.py:590`). But they live in an
untyped jsonb blob with no column, no index, and **no foreign key**.

That last part is almost certainly the root cause of the growing `Unknown`
character names. `characters.user_id` cascades from `auth.users`, so every
deleted account silently orphans that user's characters — and the call rows keep
pointing at uuids that no longer resolve. Promoting these to real columns with a
proper FK is the single highest-value schema change in the issue.

`prompt_id` is not worth adding: it is reachable by join from `character_id`,
and duplicating it would violate the same "queries, not columns" rule applied
below.

**`stt_ms` / `llm_ms` / `tts_ms` "if cheaply available".** They are not available
at any price. We run a speech-to-speech realtime model
(`xai.realtime.RealtimeModel`, `sexycall:src/agent.py:1494`) — there are no
separate STT, LLM and TTS stages to time. This part of the spec should be struck,
not deferred.

**"We need p95 by language."** At ~430 calls per 90 days ≈ 5/day, with Italian at
~13%, that is roughly 0.6 Italian calls per day. A stable Italian p95 is months
away. If the real question is *"is the German or Italian path slower or worse?"* —
and it should be, since that is ~40% of traffic — the answer is a **synthetic
probe**: run 20 scripted calls per language and measure. Hours, not months.
Waiting for organic traffic to answer a question about our own pipeline is the
wrong instrument.

## The good news the issue missed

`RealtimeModelMetrics` is **already being delivered to us and thrown away.** The
handler at `sexycall:src/agent.py:1615` receives every metrics event and keeps
only `metrics.request_id`, discarding the rest — which includes the
time-to-first-token/audio figure the issue calls "the single number that
determines whether the product feels alive."

So the headline latency ask is not an instrumentation project. It is persisting a
payload we already receive. (Confirm the exact field names against the installed
`livekit-agents` version before writing the schema.)

Two related caveats from the same area, both of which would have silently
corrupted the first charts:

- `user_transcriptions[].language` is **not a detected language.** No realtime
  provider reports one, so `_last_user_language` never populates and the field
  falls back to the *configured* session language
  (`sexycall:src/agent.py:1638-1644`). It is still useful — as "what we
  configured" — but reading it as "what the user spoke" would be wrong. Detect
  actual language from the transcript text instead, and the config-vs-actual
  delta becomes a genuine signal.
- Assistant turn timestamps mark message commit, not first audio (see the latency
  caveat in Pass A above).

## Fields that should be queries, not columns

`is_first_call`, `credits_at_start`, `credits_at_end`, and the entire proposed
`users` block (`first_call_at`, `last_call_at`, `first_purchase_at`,
`free_exhausted_at`) are all derivable from `call_sessions` and
`credit_transactions` as they stand. At this data volume, denormalising them buys
nothing and costs a backfill, a maintenance path, and a new class of drift bug —
where the column and the ledger disagree, which is precisely the failure the
issue is already complaining about elsewhere.

Ship them as a view or RPC. Promote to columns only if a query proves too slow,
which at 430 rows per quarter it will not.

`was_refusal` per turn is an inference, not telemetry, and does not belong in a
fire-and-forget write path. It is `refusal` in the friction taxonomy above —
produced by the analysis pass, where it can be re-run and corrected.

`vad_false_trigger` needs a definition before it needs a column. Write down what
counts as one on a realtime path first.

## Privacy: store less than the issue asks

`custom_prompt_text` proposes copying the full verbatim intimate prompt onto
every call row. The text already lives in `prompts`. Store `prompt_id` plus a
content hash, and snapshot the text only for genuinely one-off custom prompts.
Same signal, materially smaller breach surface, and it makes the
account-deletion path a single delete rather than a scan.

## Recommended split

**A. Bug fixes — days, no schema.**
1. `Paid Calls` = `Total Calls` (430/430). Real bug, self-contained, ~1 hour.
2. Credits-per-minute discrepancy (~642 vs ~1000/min on 109 minutes). Start with
   `20260604104100_call_sessions_fractional_mins.sql`: `billed_minutes` was
   `INTEGER` until then, and 30-second-bucket billing writes `0.5` increments,
   which Postgres rejected — crashing `meter_call_session` and `end_call_session`
   mid-call. That migration's own header documents calls left stuck and falsely
   ended as `credit_limit`. A partially-metered call is the obvious mechanism for
   a user billed ~64% of the expected rate. Check whether the affected account's
   calls predate that migration before assuming ledger corruption.
3. `Unknown` character names — see the missing FK above.

**B. Answer the original question — this week.**
The transcript churn analysis in the first half of this document. Uses only data
we already have. This is what tells us why the top user left.

**C. Cheap capture that pays for itself — small PR.**
1. `end_reason`: document the existing taxonomy, make it `not null default
   'unknown'`, backfill historical rows to `unknown` (do not guess from duration —
   the issue is right about that).
2. `character_id` + `prompt_id` FKs on `call_sessions`.
3. Persist the `RealtimeModelMetrics` we already receive — a narrow `call_turns`
   table of 4-5 fields, buffered in memory and flushed at call end, never
   blocking the audio path. Not the 11-field version.

**D. Defer or drop.**
`users`-table denormalisation (use a view), `stt_ms`/`llm_ms`/`tts_ms` (drop —
architecturally impossible), per-turn `was_refusal` (moves to B),
`vad_false_trigger` (define first), full `custom_prompt_text` (store the hash).

Add the synthetic per-language latency probe as its own small task. It answers
the 40%-of-market question now, instead of in six months.
