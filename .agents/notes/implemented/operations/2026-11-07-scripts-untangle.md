# Scripts untangle

## State

Every operator command in `scripts/` runs through one CLI helper, changes
credits through one ledger module, and shares the file, CSV, ffmpeg and R2 key
helpers. `scripts/README.md` documents how to run and write commands. The
call-analysis queue logic and the R2 folder layout live in the web app.

## Decisions

- `lib/cli.mts` owns env loading, argument parsing, path arguments and the
  entry point.
  - Env files load from fixed paths: `scripts/.env.local`,
    `apps/web/.env.local`, the root `.env.local`, `scripts/.env`,
    `apps/web/.env`, the root `.env`. The root files are included because
    some checkouts keep their env there. The first value
    wins and the shell beats every file. `--env-file` loads only the named
    files and fails on a missing one, so a typo cannot fall back to another
    environment.
  - One leading `--` is dropped because pnpm 11 forwards it; unknown options
    are errors.
  - Path arguments resolve from `INIT_CWD`, so the root aliases can delegate to
    `scripts/package.json` and still take root-relative paths and shell globs.
    Default outputs stay relative to the working directory, which is `scripts/`
    under pnpm, where `scripts/.gitignore` covers reports with production data.
  - `runScript` runs `main` only from the entry point and turns a thrown error
    into its message and exit code 1.
- `createScriptAdminClient` prints the host, LOCAL or PRODUCTION, and the
  access mode before the first request. `readOnly` wraps fetch to block every
  method except GET and HEAD.
- `lib/ledger.mts` is the one credit module.
  - Readers page by `id` and stop on an empty page, so a lower server row cap
    cannot truncate a read. A request sends at most 100 user IDs.
  - The equation is `expectedBalance(net, used) = sum(amount) - sum(credits_used)`.
    `summarizeLedger` splits it into purchases, freemium, refunds added and
    removed, and the cash view. `refund-credits` derives the credits still owed
    as `max(0, -delta - refundsAdded)`, so credits-only refunds count as
    compensation.
  - Paid predicates: `hasEverPaid` (any purchase or top-up, as the web app's
    `hasUserPaid`), `paidBefore(at)` for `free_call`, and `hasCashPurchase`
    for cash refunds.
  - `adjustCredits` inserts a `refund` row, then calls the increment or
    decrement RPC. A rejected RPC (a 4xx status) deletes the row again; no
    response or a 5xx keeps the row and tells the operator to check the
    balance. Every row carries `metadata.reason`.
  - `findRefund` finds an earlier refund row by its metadata;
    `batch-refund-credits` skips a call whose `reason` and `sourceId` already
    have one, which matches rows from every version of the command.
  - `refundPayment` owns the negative `metadata.dollarAmount` that
    `summarizeLedger` and daily-stats read.
  - Both penalty resets skip paid users.
- `scripts/package.json` defines every maintained command. The root
  `package.json` aliases each one as `pnpm --filter @sexyvoice/scripts <name>`.
- Shared helpers: `lib/r2-keys.mts` derives keys and URLs for both uploaders
  and the catalog SQL; `lib/files.mts` has `writeNewJson` for reports and
  `replaceJson` for files rewritten in place; `lib/csv.mts` guards formulas;
  `lib/ffmpeg.mts` runs ffmpeg and ffprobe; `lib/deny-domains.mts` points the
  disposable-email check at the list signup uses.
- Scripts import provider IDs from the web app: the sample catalog ID is typed
  against `TtsModelId`, xAI samples call `generateXaiTts`, the dispute report
  reads `AUDIO_FOLDERS`, and the clone demo help reads its config.

## Rejected

- A database function that writes the row and moves the balance in one
  transaction. The refactor allowed no migration. The duplicate check before
  the insert is not atomic, which is acceptable for operator runs one at a time.
- `process.chdir(INIT_CWD)`. It would move default reports with production
  data to the repository root, which `.gitignore` does not cover.
- Help text generated from option metadata. Each command keeps a hand-written
  `--help`.
- One import form for web modules. Commands run under `tsx` (CommonJS, default
  import) and plain `node` (ESM, named imports), and both runners stay.

## Consequences

- A penalty reset decrements the balance it read, so a concurrent spend fails
  that user's reset instead of leaving a ledger row that differs from the
  change.
- Some copies have no importable web source: the Gemini 3.1 model ID, the
  `## TRANSCRIPT` marker and the `-1` duration sentinel in
  `find-truncated-gemini31-tts.mjs`; the hand-built Mistral request in
  `generate-clone-demos.mts`; the DeepFilterNet3 parameters, price and 60 s
  cap in `compare-audio-cleanup.mts`; the demo paths in
  `generate-audio-waveforms.mts`.

## Verification

- `pnpm --filter @sexyvoice/scripts test`: 155 tests pass with ffmpeg
  installed.
- `pnpm exec tsc --noEmit` in `scripts/` and the pre-commit `pnpm type-check`
  pass.
- Every command's `--help` works through pnpm with a leading `--`.
- `pnpm upload-r2-files --dry-run` resolves a root-relative glob through the
  root alias, and `pnpm generate-audio-waveforms` finds all waveforms current.
- `prepare-gemini-voice-sql --draft` reproduces `add-gemini-38-voices.sql`
  apart from the draft guard.
- No command ran against a database, R2, Stripe or a provider API.
