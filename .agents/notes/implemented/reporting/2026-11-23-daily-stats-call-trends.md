# Agent Note: Daily stats call trends

Status: implemented — the Calls section flags large changes in minutes and
splits calls by user and character

## Problem

The Calls section of the daily Telegram report put yesterday's counts next to
14-day totals. Its only trend was a raw difference, such as `(-3.4)`, with no
named baseline. Reading direction meant dividing by 14 by hand, and drops such
as paying users' minutes falling by three quarters stayed hidden. The report
could not tell public-character calls from custom ones, or custom calls on
cloned voices from those on Grok's built-in voices.

## Decision

`apps/web/app/api/daily-stats/calls.ts` formats the section. Each call line
shows count, total minutes and average call length. Minutes carry an arrow
through `formatTrend` in `utils.ts`: `↑61%` or `↓74%` for a change of 25% or
more, `new` from a zero baseline, and nothing otherwise. The weekly line and the
free and paying user lines also compare average call length, with `→` for a
change under 10%; the owner reads those as engagement signals.

- The daily baseline is the average of the 14 days before yesterday, so the
  call read covers 15 days. Including yesterday in its own baseline would pull
  each change toward zero, by a fourteenth at 14 days.
- A `7d vs prior 7d` line shows direction. One day with a handful of paid calls
  swings by tens of percent.
- Minutes drive AI cost and engagement, and counts mostly move with them, so
  counts carry no arrow. Below 25%, a day of a few dozen calls is ordinary
  noise.
- Calls split by user (`free_call`) and by experience: public character
  (`metadata.character_id` with `characters.is_public`), custom with a Grok
  voice, and custom with a cloned voice (`callVoiceProvider`). Calls with no
  character are unsaved custom prompts, so they count as custom.

`getCallSessionsInRange` selects `metadata->>character_id`, and
`getPublicCharacterIds` reads the featured character IDs. The local activity
cache stores those IDs at version 7.

## Alternatives considered

- **Keep the 14-day average that includes yesterday.** It matches the other
  report sections but understates every change.
- **Average the 13 days before yesterday.** It needs no extra day of data, but
  the `13d` label stood out among the report's `14d` figures.
- **An aligned table in a Telegram `<pre>` block.** Columns would line up, but
  the whole message would need `parse_mode: 'HTML'` and escaping.
- **A percentage on every figure,** including counts, average length, cost and
  new characters. About 22 percentages made the section hard to read, none
  stood out, and on small counts a percentage overstates noise.
- **A full user × experience matrix.** Six rows a day, and custom characters
  require a paid account, so the free × custom rows stay empty.

## Consequences

The section grows from nine lines to twelve. Minute changes under 25%, and
every change in counts, cost or the other average lengths, show no arrow; read
those against the `14d daily avg` line. Small segments can still cross 25% on
noise. Other report sections keep `formatChange` and a 14-day average that
includes yesterday, so their changes read slightly smaller. `AI usage (est.)`
uses the cost windows from `contribution.ts`, which key on `occurred_at` or
`ended_at`, so its cost per minute is approximate around midnight.
