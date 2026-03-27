# Q2 2026 Plan: Explore Page and Voting Architecture

<!-- gpt-5.4 -->

## Goal

Build a public `Explore` page where visitors can browse shared audio generations,
while authenticated users can vote on them.

This plan aims to support:

- public read access without auth
- authenticated voting
- accurate "top today / this week / this month / all time" rankings
- good query performance as vote volume grows
- a schema that stays simple now but scales later
- safe moderation and visibility controls

---

## Product Requirements

### Explore page
- Public page, readable without authentication
- Lists audio generations that users explicitly choose to share
- Shows audio, prompt text, voice/model info, and ranking metadata
- Supports sorting/filtering such as:
  - newest
  - top all time
  - top today
  - top this week
  - top this month

### Voting
- Only authenticated users can vote
- A user can vote at most once per audio file
- Users should be able to remove their vote later if we decide to support undo
- Votes should be timestamped so we can compute rankings by time window

### Analytics / ranking
We want to keep track of:
- most voted today
- most voted this week
- most voted this month
- most voted all time

This means we need both:
- a historical vote event record
- a fast way to rank public audio

---

## Decision Summary

## 1. Keep public audio in `audio_files`
Do **not** move public/shared audio into a separate table.

Reason:
- a public audio file is still the same core entity as a private audio file
- it already belongs to a user and has the same URL, prompt, voice, model, and metadata
- "public" is a visibility/publication state, not a different domain object

So `audio_files` remains the source of truth for generated audio.

## 2. Add a separate `audio_file_votes` table
Do **not** rely on `audio_files.total_votes` alone.

Reason:
- `total_votes` can only represent a current total
- it cannot answer "most voted this week/day/month" correctly
- it cannot prevent duplicate votes by the same user
- it cannot provide an auditable history of vote activity

The vote table becomes the source of truth for all votes.

## 3. Keep `audio_files.total_votes` as a cached counter
Do **not** delete `total_votes` yet.

Reason:
- it is useful for fast all-time ordering
- it avoids expensive aggregate queries for common public Explore reads
- it can be maintained from the votes table as a denormalized counter

So:
- `audio_file_votes` = source of truth
- `audio_files.total_votes` = cached all-time counter

## 4. Add daily rollups later if needed
For launch, we can compute day/week/month from raw votes.

As Explore traffic and vote volume increase, we should add a daily rollup table.

Recommended later table:
- `audio_file_vote_daily_stats`

This gives us fast trending queries without losing correctness.

---

## Current Schema Notes

Today the repo already has:

- `audio_files.is_public`
- `audio_files.total_votes`

This means the initial data model already points in the right direction.

However, `total_votes` alone is not enough for time-window leaderboards.

---

## Proposed Schema

## `audio_files`
Keep `audio_files` as the main content table.

Relevant fields now or soon:
- `id`
- `user_id`
- `voice_id`
- `url`
- `text_content`
- `model`
- `created_at`
- `is_public`
- `status`
- `metadata`
- `total_votes`

### Notes
- `is_public` = user intent / visibility
- `status` should be respected for Explore reads so deleted or moderated content
  is not shown
- `metadata` can later store enrichment such as detected language or explore tags
- `total_votes` should be treated as a derived value, not the source of truth

### Recommended indexes
- `(is_public, status, created_at desc)`
- `(is_public, status, total_votes desc)`

These support:
- newest public audio
- top all-time public audio

---

## `audio_file_votes`
New table for vote events and deduplication.

### Proposed columns
- `id uuid primary key`
- `audio_file_id uuid not null references public.audio_files(id) on delete cascade`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `value smallint not null default 1`
- `created_at timestamptz not null default now()`

### Constraints
- `unique (audio_file_id, user_id)`

### Why this design
- one vote per user per audio
- stores the timestamp of the vote
- enables daily/weekly/monthly leaderboard queries
- can support future undo/unvote
- can support future change to reaction types if needed

### Recommended indexes
- unique `(audio_file_id, user_id)`
- `(created_at desc)`
- `(audio_file_id, created_at desc)`
- `(user_id, created_at desc)`

### Notes
- `value` is optional for now because we currently only need upvotes
- keeping `value` gives flexibility later for weighted voting or downvotes
- if we do not want future downvotes, we can constrain `value = 1`

---

## Optional Future Table: `audio_file_vote_daily_stats`
This is not required on day one, but it is the right next step if Explore grows.

### Proposed columns
- `audio_file_id uuid not null references public.audio_files(id) on delete cascade`
- `bucket_date date not null`
- `vote_count integer not null default 0`
- primary key `(audio_file_id, bucket_date)`

### Why daily rollups are a good compromise
They let us answer:
- top today: 1 bucket
- top this week: 7 buckets
- top this month: ~30 buckets

This is much cheaper than scanning all raw votes forever, while still being
flexible enough for most ranking windows.

### When to add it
Add this after launch if:
- Explore page traffic increases
- vote count becomes large enough that raw aggregation is expensive
- we want leaderboard APIs to stay very fast and cacheable

---

## Read / Write Model

## Source of truth
- votes are stored in `audio_file_votes`

## Cached counters
- all-time count is stored in `audio_files.total_votes`

## Optional analytics acceleration
- time-bucketed counts later stored in `audio_file_vote_daily_stats`

This gives the platform:
- correctness
- auditability
- performance
- a clean future migration path

---

## Write Path

When a user votes:

1. verify the audio file exists and is eligible for public voting
2. insert into `audio_file_votes`
3. increment `audio_files.total_votes`
4. optionally increment the current day bucket in `audio_file_vote_daily_stats`
   if that table exists

When a user removes a vote:

1. delete from `audio_file_votes`
2. decrement `audio_files.total_votes`
3. decrement the current day bucket if rollups exist

### Important implementation note
These updates should be handled atomically.

Preferred approaches:
- database function / RPC
- or trigger-based maintenance
- avoid app-only multi-step writes if possible

Why:
- prevents counter drift
- makes vote creation/removal safe under concurrency
- keeps public ranking data consistent

---

## Explore Query Strategy

## Sort: newest
Use `audio_files` directly:
- `is_public = true`
- `status = 'active'`
- order by `created_at desc`

## Sort: top all time
Use `audio_files.total_votes`:
- `is_public = true`
- `status = 'active'`
- order by `total_votes desc`

This is the best use of the cached column.

## Sort: top today / week / month
Launch approach:
- aggregate from `audio_file_votes`
- filter by vote `created_at` range
- join back to `audio_files`
- include only `is_public = true` and `status = 'active'`

Scale approach:
- aggregate from `audio_file_vote_daily_stats`
- sum buckets for requested window
- join back to `audio_files`

---

## Public Explore API Shape

The Explore page is public read-only.

Recommended response fields:
- `id`
- `url`
- `text_content`
- `voice_id`
- `voice name`
- `model`
- `created_at`
- `total_votes`
- maybe `metadata.detectedLang`
- maybe author display info if product wants attribution
- maybe a `viewerHasVoted` field on authenticated requests only

For public unauthenticated reads:
- never expose sensitive user data
- do not expose internal storage keys or unnecessary private fields

---

## Moderation / Visibility Model

Even though Explore is public, publication should remain controlled.

### Minimum rules
Only show rows where:
- `is_public = true`
- `status = 'active'`

### Why this matters
This prevents:
- deleted audio from being listed
- moderated/blocked audio from being listed
- internal/private content leaking into public Explore

### Future moderation extensions
If moderation grows, consider one of:
- more `status` states on `audio_files`
- or a companion publication/moderation table

Examples:
- `active`
- `hidden`
- `deleted`
- `moderated`

At this stage, a separate full public-audio table is still not recommended.

---

## Why Not a Separate Public Audio Table

A separate duplicated table such as `public_audio_files` is not recommended now.

### Reasons
- duplicates core data
- creates synchronization complexity
- makes edits, deletes, and ownership harder
- adds more write paths and more room for bugs
- the domain object is still an audio file, just with public visibility

### When a separate companion table might make sense
Only if public publication becomes a much richer workflow, for example:
- human moderation queue
- editorial curation
- immutable publication snapshots
- publication-specific SEO metadata
- featured collections

Even then, prefer a small companion table such as `audio_file_publications`
rather than duplicating the entire audio row.

---

## RLS / Access Model

## Explore reads
Public users should be able to read public Explore content without auth.

This means policies or query layer must allow reading:
- only public, active audio
- only public vote aggregates or counters

## Voting writes
Only authenticated users should be able to:
- create their own vote
- remove their own vote

Recommended vote rules:
- insert allowed only for authenticated users
- delete allowed only when `user_id = auth.uid()`
- no direct client-side updates to cached counters

Cached counters should be maintained only by trusted backend/database logic.

---

## Performance Strategy

## What we optimize for now
- fast all-time ranking
- correct daily/weekly/monthly rankings
- minimal schema complexity at launch

## What we optimize for later
- fast trending leaderboards under higher vote volume
- efficient cached public Explore responses
- stable performance without scanning all raw votes

### Phase 1 performance plan
- query newest and top-all-time from `audio_files`
- query day/week/month from `audio_file_votes`
- add proper indexes
- cache Explore endpoints if needed

### Phase 2 performance plan
- add `audio_file_vote_daily_stats`
- use daily rollups for trending windows
- keep `audio_file_votes` as canonical source for rebuilding rollups if needed

---

## Data Integrity Principles

### `audio_files.total_votes`
Treat this as derived state.

It must be possible to rebuild it from:
- `audio_file_votes`

This lets us:
- detect drift
- repair counters
- trust analytics over time

### `audio_file_vote_daily_stats`
Also treat this as derived state.

It must be possible to rebuild it from:
- `audio_file_votes`

This prevents rollups from becoming irreversible or opaque.

---

## Migration / Implementation Plan

## Phase 1: Launch-ready Explore foundation
1. Keep `audio_files.is_public`
2. Keep `audio_files.total_votes`
3. Add `audio_file_votes`
4. Add indexes
5. Implement authenticated vote / unvote flow
6. Maintain `total_votes` atomically
7. Build Explore page for:
   - newest
   - top all time
   - top today
   - top this week
   - top this month

## Phase 2: Scale trending
1. Add `audio_file_vote_daily_stats`
2. Backfill from `audio_file_votes`
3. Switch day/week/month Explore ranking to rollups
4. Keep raw votes as source of truth

## Phase 3: Moderation / publication improvements
1. add publication timestamps if needed
2. add moderation states or companion publication metadata
3. add featured/curated sections if product wants editorial control

---

## Concrete Recommendation

### Keep
- `audio_files` as the main content table
- `audio_files.total_votes` as a cached all-time counter

### Add
- `audio_file_votes` as the authoritative vote table

### Add later if needed
- `audio_file_vote_daily_stats` for fast daily/weekly/monthly leaderboards

### Do not do now
- do not delete `total_votes`
- do not move public audio into a separate duplicated table

---

## Final Recommendation

For Explore and voting, the best architecture is:

- `audio_files` stores the shared/public audio content
- `audio_file_votes` stores every user vote with timestamp
- `audio_files.total_votes` remains as a denormalized all-time counter
- optional daily rollups are introduced later for leaderboard performance

This gives us:
- correct time-window rankings
- fast public reads
- clean ownership boundaries
- straightforward moderation controls
- a schema that can scale with both product needs and traffic
