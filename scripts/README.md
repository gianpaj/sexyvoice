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
1  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...  {"priceId": "standard", "dollarAmount": 5}
2  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...                         {"dollarAmount": 5}
3  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...     {"priceId": "base", "dollarAmount": 10}
4  xxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx  ...     {"priceId": "base", "dollarAmount": 10}

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
