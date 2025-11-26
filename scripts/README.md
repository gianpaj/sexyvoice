## Reset Freeloader Credits Script

Node.js/TypeScript script to reset credits to 0 for users who exploited a bug that prevented credit deduction.

### Quick Start
```bash
# Show help
pnpm tsx scripts/reset-freeloader-credits.ts --help

# Test with dry-run flag (no changes made)
pnpm tsx scripts/reset-freeloader-credits.ts --dryrun freeloaders.csv

# Test with limited records
pnpm tsx scripts/reset-freeloader-credits.ts --dryrun --limit 10 freeloaders.csv

# Run for real (will prompt for confirmation)
pnpm tsx scripts/reset-freeloader-credits.ts freeloaders.csv
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
- 50 users: ~5 seconds (vs ~50 seconds sequential)
- 100 users: ~10 seconds (vs ~100 seconds sequential)
- Processes 10 users per database query

### Documentation
- [RESET_CREDITS_GUIDE.md](./RESET_CREDITS_GUIDE.md) - Complete guide with examples
- [QUICKREF.md](./QUICKREF.md) - Quick reference card
- [identify-freeloaders.sql](./identify-freeloaders.sql) - SQL to find freeloaders

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
pnpm exec tsx scripts/refund-credits.ts <user-id>

# Or run interactively (will prompt for user ID)
pnpm exec tsx scripts/refund-credits.ts
```

### What it does:
1. Fetches all credit transactions for the user
2. Calculates total credits purchased (from `purchase` and `topup` transactions)
3. Calculates total credits used (from `audio_files.credits_used`)
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

The calculated available credits = (purchase + topup + freemium credits) - (credits used from audio files) - (previously refunded credits)

If there's a mismatch, the script will throw an error:

```
Credit mismatch detected!
  Calculated from transactions: 3800
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

## Credit transactions (Supabase)

### 1. Download only paid transactions

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
