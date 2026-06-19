# Scripts

## Generate Gemini Speech Samples Script

Generates speech samples through the public `/api/v1/speech` endpoint and saves
them as MP3 files. The API returns WAV for `gpro`/`gpro31`, so the script
downloads the WAV and converts it to MP3 with `ffmpeg` (required).

### Quick Start

```bash
# Show help
pnpm generate-gemini-speech-samples --help

# Generate one sample by voice ID (model is inferred from the voice)
SEXYVOICE_API_KEY=xxx \
  pnpm generate-gemini-speech-samples --voiceId 85153e4b-f5b0-477a-856e-1bf05fd84165

# Generate samples for specific voices with a model + style
SEXYVOICE_API_KEY=xxx \
  pnpm generate-gemini-speech-samples --model gpro --style "calm" \
  --text "Hello there" --voices achernar,zephyr

# Run against a local/dev server
SEXYVOICE_API_BASE_URL=http://localhost:3000 SEXYVOICE_API_KEY=xxx \
  pnpm generate-gemini-speech-samples --voiceId <id>
```

> Note: you don't need `--` before the flags (e.g. `pnpm generate-gemini-speech-samples --voiceId <id>`).

### CLI Options

- `--voiceId <id>` - Voice ID from `GET /api/v1/voices`. Used **instead of** `--voice` + `--model` (the model is inferred from the voice).
- `--model <gpro|gpro31>` - Gemini model alias (used with `--voices`)
- `--voices <a,b,c>` - Comma-separated voice names (defaults to a built-in list when neither `--voices` nor `--voiceId` is given)
- `--text <text>` - Text to synthesize
- `--style <style>` - Emotion/style prompt applied by the API
- `--seed <number>` - Optional deterministic seed
- `--out <dir>` - Output directory (default: `scripts/generated-speech`)
- `--base-url <url>` - Override `SEXYVOICE_API_BASE_URL`
- `--api-key <key>` - Override `SEXYVOICE_API_KEY`
- `--keep-wav` - Keep the downloaded WAV next to each MP3
- `-h, --help` - Show help message

### Environment

- `SEXYVOICE_API_KEY` - Required Bearer API key
- `SEXYVOICE_API_BASE_URL` - Optional API host (default: `https://sexyvoice.ai`)
- `NEXT_PUBLIC_STYLE_PROMPT_VARIANT_MOAN` - Default `--style` if not passed
- `DEBUG=1` - Print full stack traces on error

`.env.local`/`.env` files in the repo root, `apps/web/`, and `scripts/` are
loaded automatically.

### Requirements

- `ffmpeg` on your `PATH` (used to convert WAV → MP3)

### Troubleshooting

- **`Could not reach Speech API at ...: ENOTFOUND` / `ECONNREFUSED`** - the host
  is wrong or the server isn't running. Check `SEXYVOICE_API_BASE_URL`.
- **`... SELF_SIGNED_CERT_IN_CHAIN`** - the server uses a self-signed
  certificate. For local/dev only, prepend `NODE_TLS_REJECT_UNAUTHORIZED=0`, or
  point Node at the cert with `NODE_EXTRA_CA_CERTS=/path/to/cert.pem`.

---

## Reset Freeloader Credits Script

Node.js/TypeScript script to reset credits to 0 for users who exploited a bug that prevented credit deduction.

### Quick Start

```bash
# Show help
pnpm reset-freeloader-credits --help

# Test with dry-run flag (no changes made)
pnpm reset-freeloader-credits --dryrun freeloaders.csv

# Test with limited records
pnpm reset-freeloader-credits --dryrun --limit 10 freeloaders.csv

# Run for real (will prompt for confirmation)
pnpm reset-freeloader-credits freeloaders.csv
```

### CLI Options

- `--dryrun` - Run in dry-run mode (no database changes)
- `-l, --limit <number>` - Limit number of records to process
- `-h, --help` - Show help message

### CSV Format

```csv
id,username,created_at,total_credits_received,total_credits_used,current_credits,usage_percentage
26fb4371-...,user@email.com,2025-11-26 16:11:36.930227+00,10000,11856,2464,118.56
```

### Features

- **Batch processing**: Fetches credit balances in batches of 10 (10x faster!)
- **CLI options**: `--dryrun`, `--limit`, `--help` flags
- Dry-run mode for safe testing
- UUID validation
- Environment detection (local vs production)
- Individual error handling per user
- Optional audit trail transaction logging
- Detailed progress reporting

### Performance

- 50 users: ~10 seconds (vs ~50 seconds sequential)
- 100 users: ~10 seconds (vs ~100 seconds sequential)
- Processes 10 users per database query

### Documentation

- [RESET_CREDITS_GUIDE.md](./RESET_CREDITS_GUIDE.md) - Complete guide with examples
- [QUICKREF.md](./QUICKREF.md) - Quick reference card
- [identify-freeloaders.sql](./identify-freeloaders.sql) - SQL to find freeloaders

---

## Backfill Free Call Script

Retroactively sets the `free_call` column on `call_sessions` by checking whether the
user had a paid transaction (`purchase` or `topup`) before the call started.

### Quick Start

```bash
# Show help
pnpm backfill-free-call --help

# Dry-run to preview changes
pnpm backfill-free-call --dryrun

# Dry-run first 50 records
pnpm backfill-free-call --dryrun --limit 50

# Apply changes (prompts for confirmation)
pnpm backfill-free-call
```

### CLI Options

- `--dryrun` - Run in dry-run mode (no database changes)
- `-l, --limit <number>` - Limit number of call sessions to process
- `-h, --help` - Show help message

### What it does

- Fetches `call_sessions` in batches of 1000
- Fetches paid credit transactions in batches of 50 users
- Sets `free_call = true` if the user had **no** paid transaction before the call
- Sets `free_call = false` if the user **had** paid before the call
- Applies updates in batches of 100

### Notes

- Requires `.env` or `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Output timestamps are normalized to second precision

---

## Refund Credits Script

Interactive Node.js/TypeScript script to process credit refunds for users.

### Features

- Calculates maximum refundable amount based on credits purchased vs. used
- Prevents refunds for freemium-only users
- Links refund to original payment intent
- Optional Stripe charge ID tracking
- Interactive prompts with confirmation
- Smart dollar amount suggestions (uses exact transaction amount when refunding full transaction)
- Validates credit balance integrity before processing
- Automatically updates the `credits` table to reflect the refunded amount

### Usage

```bash
# Run with user ID as argument
pnpm refund-credits -- <user-id>

# Or run interactively (will prompt for user ID)
pnpm refund-credits
```

### What it does

1. Fetches all credit transactions for the user
2. Calculates total credits purchased (from `purchase` and `topup` transactions)
3. Calculates total credits used (from `usage_events.credits_used`)
4. Calculates total credits already refunded (from `refund` transactions)
5. Fetches user's credit balance from `credits` table
6. **Validates that calculated credits match actual balance** (throws error if mismatch)
7. Determines maximum refundable credits (purchased - used - refunded)
8. Calculates USD refund amount based on credit rate
9. Prompts for credit amount to refund and which transaction to refund against
10. **Suggests dollar amount**: If refunding full transaction, suggests exact transaction amount; otherwise uses credit rate calculation
11. Prompts for USD amount to refund (can accept suggestion or enter custom amount)
12. Optionally records Stripe charge ID (`ch_...`)
13. Inserts negative credit transaction with `refund` type
14. Updates the `credits` table by calling `decrement_user_credits` function

### Requirements

- `.env` or `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- User must have `purchase` or `topup` transactions with `metadata.dollarAmount`
- Freemium-only users cannot be refunded

### Example Output

```
Processing refund for user: xxx-xxx-xxx

=== Credit Refund Calculation ===
Total Credits Purchased: 5000
Total Credits Used: 1200
Total Credits Refunded: 0
Available Credits: 3800
Total Spent: $50.00
Credit Rate: $0.0100 per credit

Max Refundable Credits: 3800
Max Refund Amount: $38.00
```

### How It Works

The script prevents duplicate refunds by tracking all previous refunds and automatically updates the user's credit balance:

**Available Credits Formula:**

```
Available Credits = (Purchased + Topup + Freemium) - Used - Refunded
```

**Maximum Refundable Credits Formula:**

```
Max Refundable = Total Purchased - Total Used - Total Already Refunded
```

**Example scenario:**

- User purchased 5000 credits for $50.00
- User used 1200 credits
- User previously received a refund of 500 credits
- Maximum refundable now: 5000 - 1200 - 500 = **3300 credits** ($33.00)

This ensures:

- Users can't be refunded more than they paid
- Users can't get refunds for credits they've already used
- Users can't receive multiple refunds for the same credits
- Data integrity is validated before processing (calculated vs actual balance)
- The `credits` table accurately reflects the user's remaining credits after refund
- Smart dollar amount suggestions prevent rounding errors on full transaction refunds

### Data Integrity Check

Before processing any refund, the script validates that the calculated available credits matches the actual balance in the `credits` table.

The calculated available credits = (purchase + topup + freemium credits) - (credits used from `usage_events`) - (previously refunded credits)

If there's a mismatch, the script will throw an error:

```
Credit mismatch detected!
  Calculated from usage_events: 3800
  Actual balance in credits table: 3750
  Please investigate data integrity before processing refund.
```

This prevents refunds when there are data inconsistencies that need to be resolved first.

### Smart Dollar Amount Suggestions

When you select a transaction to refund:

**If refunding the full transaction amount:**

```
💡 Note: Refunding full transaction amount. Suggested refund: $10.00
Enter USD amount to refund [suggested: $10.00]:
```

The script suggests the exact dollar amount from that transaction's metadata, preventing rounding errors.

**If refunding a partial amount:**

```
Calculated refund based on credit rate: $7.50
Enter USD amount to refund [suggested: $7.50]:
```

The script calculates the amount based on the credit rate (total spent / total credits).

You can press Enter to accept the suggestion, or enter a custom amount.

---

## Batch Refund Credits Script

Processes platform-bug credit refunds in bulk from a CSV of duplicate usage events. Adds credits back to affected users (no USD refund) one by one, with a single confirmation prompt before starting.

### Usage

```bash
# Dry run first to verify CSV parsing and row count
pnpm batch-refund-credits -- dupes.csv --dry-run

# Apply refunds (prompts for confirmation)
pnpm batch-refund-credits -- dupes.csv
```

### CSV Format

Export the duplicate sessions query result as CSV:

```csv
source_id,user_id,event_count,first_event_at,last_event_at,duplicate_credits,duplicate_dollars,end_reasons
38ae34f3-f7fd-48ec-88dc-0955f0722812,8c56bc8d-b16f-4de3-acf7-2f58313b209b,19,2026-05-15 16:45:07+00,2026-05-15 16:47:46+00,72000,null,"[""credit_limit""]"
```

Only `source_id`, `user_id`, and `duplicate_credits` are used. Rows with `duplicate_credits` ≤ 0 or null are skipped automatically.

### SQL to identify duplicate sessions

```sql
WITH dupes AS (
    SELECT
        source_id,
        user_id,
        COUNT(*)                                  AS event_count,
        MIN(occurred_at)                          AS first_event_at,
        MAX(occurred_at)                          AS last_event_at,
        SUM(credits_used)   - MAX(credits_used)   AS duplicate_credits,
        SUM(dollar_amount)  - MAX(dollar_amount)  AS duplicate_dollars,
        ARRAY_AGG(DISTINCT metadata ->> 'end_reason') AS end_reasons
    FROM usage_events
    WHERE source_type = 'live_call'
    GROUP BY source_id, user_id
    HAVING COUNT(*) > 1
)
SELECT * FROM dupes
ORDER BY event_count DESC, last_event_at DESC;
```

### What it does

1. Parses the CSV (handles quoted fields)
2. Shows total rows and total credits to restore, then asks for confirmation
3. For each row, inserts a `refund` credit transaction (positive amount, credits added back) and calls `increment_user_credits`
4. Continues on per-row errors — failed rows are listed in the summary
5. Exits with code 1 if any rows failed

Each refund transaction is recorded with:

- `type: 'refund'`
- `description: "Refund - Double billing (voice call <source_id_prefix>)"`
- `metadata.reason: "Double billing - voice call"`
- `metadata.sourceId`: the full source_id for traceability

### Requirements

- `.env` or `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

---

## Check Disposable Emails Script

Node.js script (`check-disposable-emails.mjs`) that fetches the most recently
created `profiles` and checks how many `username` values (which are actually the
user's email) belong to a disposable / temporary email provider. It can
optionally reset the flagged users' credits to 0.

Two independent sources are cross-checked:

1. The `disposable-email-domains-js` npm package (the same one used by the web
   app's signup route, `apps/web/app/auth/signup/route.ts`).
2. The `denyDomains.txt` list from
   [amieiro/disposable-email-domains](https://github.com/amieiro/disposable-email-domains),
   which is shallow-cloned into `scripts/.cache` on first run and `git pull`ed
   on subsequent runs.

### Quick Start

```bash
# Check the last 1000 profiles (default) and write a summary + CSV
pnpm check-disposable-emails

# Check the last 3000 profiles (paginates past Supabase's 1000-row cap)
pnpm check-disposable-emails -- --limit 3000

# Only profiles created in the last 14 days
pnpm check-disposable-emails -- --days 14

# Preview resetting flagged users' credits to 0 (no DB changes)
pnpm check-disposable-emails -- --days 14 --reset-credits --dry-run

# Apply the reset (prompts for a typed "RESET CREDITS" confirmation)
pnpm check-disposable-emails -- --days 14 --reset-credits

# Apply without the prompt (e.g. CI)
pnpm check-disposable-emails -- --days 14 --reset-credits --yes
```

### CLI Options

- `--limit <n>` - Number of most-recent profiles to fetch (default: 1000)
- `--days <n>` - Only consider profiles created in the last `<n>` days
- `--out <dir>` - Output directory for the summary / CSV (default: cwd)
- `--no-clone` - Skip cloning/updating the amieiro repo (use cached copy)
- `--reset-credits` - Reset flagged users' credits to 0
- `--dry-run` - With `--reset-credits`, only report what would change
- `--yes` - Skip the interactive confirmation for a live reset

### Output

- `disposable-emails-summary-<timestamp>.txt` - Counts and percentages by
  source, plus the most common disposable domains (also printed to stdout)
- `disposable-emails-<timestamp>.csv` - Every flagged profile with
  `by_package` / `by_amieiro` columns (gitignored)

### Credit reset

When `--reset-credits` is passed, for each flagged user with a **positive**
balance the script resets their credits. Users are **skipped** when they:

- have ever paid — any `purchase` or `topup` `credit_transactions` row, or
- already have a balance of ≤0.

For each user that is reset, the script:

1. Sets `credits.amount` to 0
2. Inserts an audit `credit_transactions` row with:
   - `type: 'refund'` — the `credit_transaction_type` enum has no `penalty` /
     `ban` value, so this reuses `'refund'` (as
     `reset-freeloader-credits.mts` does) and records the real reason in the
     description / metadata. To change it later, edit the `RESET_TX_TYPE`
     constant (and add the enum value via a migration first).
   - `amount: -<previous balance>`
   - `description: "Credits reset to 0 — disposable email signup (<domain>)"`
   - `metadata.reason: "disposable_email"` plus `domain`, `detected_by`,
     `previous_amount`, and a `timestamp`

> ⚠️ Detection is **domain-based** and the amieiro list is broad. Spot-check the
> generated CSV before a live reset to make sure no legitimate users are caught.

### Requirements

- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — read
  automatically from `apps/web/.env.local` (then `scripts/.env`)
- `git` (for cloning the amieiro list on first run)

---

## Sync Deny Domains Script

`sync-deny-domains.mjs` regenerates the disposable-domain list bundled into the
web app's signup route. It clones/updates
[amieiro/disposable-email-domains](https://github.com/amieiro/disposable-email-domains)
in `scripts/.cache`, normalizes its deny list (trim, lowercase, dedupe, sort)
and writes it to `apps/web/lib/disposable-email/deny-domains.json` as a minified
JSON array, which the web app imports and turns into a `Set`.

The signup route (`apps/web/app/auth/signup/route.ts`) checks this list **in
addition** to the `disposable-email-domains-js` package, which catches far more
disposable signups (~16% vs ~1.6% of recent profiles in production).

```bash
# Refresh the bundled list (run after amieiro publishes updates)
pnpm sync-deny-domains
```

The generated `deny-domains.json` is ~3 MB; it is committed (so deploys don't
need network access) and excluded from the formatter via `.biomeignore` (kept
minified). TypeScript widens the homogeneous array to `string[]`, so importing it
stays cheap to type-check.

---

## Credit Transactions (Supabase)

### 1. Download Only Paid Transactions

- Display 500 rows
- Export as SQL

<https://supabase.com/dashboard/project/xx/editor/92829?schema=public&sort=created_at%3Adesc&filter=type%3Aneq%3Afreemium>

```bash
export SUPABASE_DB_URL=postgresql://postgres:xxx@db.yyyy.supabase.co:5432/postgres
```

```bash
psql $SUPABASE_DB_URL -c "COPY (select * from public.credit_transactions order by credit_transactions.id asc nulls last) TO STDOUT WITH CSV HEADER DELIMITER ',';" > credit_transactions_rows.csv
```

### 2. Clean

```bash
python scripts/clean-transactions.py backups/credit_transactions_rows_2025-10-25T15-38.csv
Loading CSV file: backups/credit_transactions_rows_2025-10-25T15-38.csv
Successfully loaded 154 rows

First few rows:
                                     id  ...                                    metadata
0  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...                                         NaN
1  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...{"packageId": "standard", "dollarAmount": 5}
2  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...                         {"dollarAmount": 5}
3  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...{"packageId": "starter", "dollarAmount": 10}
4  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...{"packageId": "starter", "dollarAmount": 10}

[5 rows x 10 columns]

Filtered from y to x transactions (only 'purchase' and 'topup' types)

Cleaned data saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned.csv
```

### 3. Visualize

```bash
python scripts/visualize-transactions.py backups/credit_transactions_rows_2025-10-25T15-38_cleaned.csv
Loading CSV file: backups/credit_transactions_rows_2025-10-25T15-38_cleaned.csv
Successfully loaded x rows
Filtered from x to x transactions (purchase/topup only)

Creating visualizations for x credit transactions...
============================================================
Dashboard saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_dashboard.png
Weekly MTD comparison chart saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_weekly_mtd_comparison.png
Hourly heatmap saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_hourly_heatmap.png
Monthly trends chart saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_monthly_trends.png
User behavior charts saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_user_behavior.png
Daily patterns chart saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_daily_patterns.png
Transaction types chart saved to: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_transaction_types.png

All visualizations created! 📊
Files saved with prefix: backups/credit_transactions_rows_2025-10-25T15-38_cleaned_
```

---

## Waveform Video Generator

Modern audio visualizer that turns any ffmpeg-compatible audio file into a
gradient waveform video with multiple style presets.

### Usage

```bash
# Neon gradient at 60fps with a custom title
python scripts/generate_waveform_video.py input.wav output.mp4 --style neon --fps 60 --title "Deep Night Session"

# Light mode preview at 720p
python scripts/generate_waveform_video.py song.mp3 preview.mp4 --style minimal --width 1280 --height 720
```

### Options

- `--style`: `neon` (default), `minimal`, `sunset`, `forest`
- `--fps`: Frames per second (default 30)
- `--width` / `--height`: Output resolution
- `--title`: Optional text rendered above the waveform
- `--preset`: ffmpeg x264 preset passed through MoviePy

## Stripe Payments Comparison and Analysis Scripts

```bash
# Set your database URL
export SUPABASE_DB_URL="postgresql://postgres:xxx@db.yyyy.supabase.co:5432/postgres"

# Run complete comparison
./compare-all-payments.sh
```

This will:

1. Fetch 500 Stripe payment intents (with pagination)
2. Export Supabase credit transactions
3. Clean both datasets
4. Detect duplicates in both systems
5. Compare and generate reports including CSV exports

## Credit Transaction Analysis Scripts

Python scripts for analyzing credit transaction data from SexyVoice.ai to extract insights about user purchasing behavior and patterns.

### Basic Analysis

```bash
python analyze-credit-transactions.py path/to/credit_transactions.csv
```

### Create Visualizations

```bash
python visualize-transactions.py path/to/credit_transactions.csv
```

### Clean Data First (Optional)

```bash
python clean-transactions.py path/to/raw_transactions.csv
python analyze-credit-transactions.py path/to/raw_transactions_cleaned.csv
```
