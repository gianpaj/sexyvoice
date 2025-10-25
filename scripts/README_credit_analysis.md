# Credit Transaction Analysis Scripts

This directory contains Python scripts for analyzing credit transaction data from SexyVoice.ai to extract insights about user purchasing behavior and patterns.

## Scripts Overview

### 1. `analyze-credit-transactions.py`
Main analysis script that provides comprehensive insights including:
- Month-to-date vs previous month comparisons
- Number of credit transactions (any type)
- Dollar amounts and revenue analysis
- Unique users count
- Most popular times of day and days of the week
- User behavior patterns and segmentation
- Transaction trends over time
- Key insights and recommendations

### 2. `visualize-transactions.py`
Visualization script that creates charts and graphs:
- Comprehensive dashboard with key metrics
- Hourly heatmap (hour vs day of week)
- Weekly MTD vs previous month comparison (transactions & revenue)
- Monthly trend analysis
- User behavior charts
- Daily usage patterns
- Transaction types analysis

### 3. `clean-transactions.py` (existing)
Data cleaning script that:
- Extracts dollar amounts from metadata JSON
- Filters to purchase/topup transactions only
- Formats datetime columns

## Installation

Install required Python packages:

```bash
pip install -r requirements.txt
```

## Usage

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

## Expected CSV Format

The scripts expect a CSV file with the following columns:

**Required columns:**
- `created_at` - Transaction timestamp
- `type` - Transaction type ('purchase', 'topup', 'usage', 'freemium')
- `user_id` - Unique user identifier

**Optional but recommended columns:**
- `metadata` - JSON string containing `dollarAmount` field
- `amount` - Credit amount
- `description` - Transaction description
- `reference_id` - External reference (e.g., Stripe payment ID)
- `subscription_id` - Subscription identifier

**Example CSV structure:**
```csv
id,user_id,amount,type,description,created_at,metadata
uuid1,user123,1000,topup,Credit purchase,2024-01-15 10:30:00,"{\"dollarAmount\":9.99}"
uuid2,user456,500,usage,Voice generation,2024-01-15 11:45:00,null
```

## Output Files

### Visualization Script Output
- `*_dashboard.png` - Comprehensive dashboard
- `*_weekly_mtd_comparison.png` - Weekly MTD vs previous month (transactions & revenue)
- `*_hourly_heatmap.png` - Hour vs day heatmap
- `*_monthly_trends.png` - Monthly trend charts
- `*_user_behavior.png` - User behavior analysis
- `*_daily_patterns.png` - Daily usage patterns
- `*_transaction_types.png` - Transaction types analysis

## Key Metrics Analyzed

### Monthly Comparisons
- Transaction count (current month vs previous month)
- Total revenue comparison
- Unique users comparison
- Average transaction value
- Growth rates (% change)

### Time Patterns
- Most popular hours of the day
- Most popular days of the week
- Peak usage times identification

### User Behavior
- User purchase frequency distribution
- User segmentation:
  - Single purchase users
  - Repeat users (2-4 purchases)
  - Power users (5+ purchases)
- Average revenue per user
- Customer lifetime value insights

### Transaction Patterns
- Transaction type distribution
- Revenue statistics (mean, median, min, max)
- Most common transaction amounts
- Weekly MTD vs previous month comparison (transactions & revenue)
- Monthly trends and seasonality

## Example Output

```
Loading CSV file: backups/credit_transactions_rows_2025-10-25T15-38_cleaned.csv
Successfully loaded x rows
Filtered from x to x transactions (purchase/topup only)

Analyzing x credit transactions...
============================================================

============================================================
MONTHLY ANALYSIS
============================================================

Current Month (MTD)
  • Transactions: 1,250
  • Revenue: $12,458.50
  • Unique Users: 892
  • Avg Transaction Value: $9.97

Previous Month
  • Transactions: 1,180
  • Revenue: $11,832.00
  • Unique Users: 845
  • Avg Transaction Value: $10.03

Growth Rates (vs Previous Month)
  • Transactions: +5.9%
  • Revenue: +5.3%
  • Unique Users: +5.6%

============================================================
USER BEHAVIOR ANALYSIS
============================================================

User Purchase Frequency:
  • Total unique users: x
  • Average transactions per user: x.x
  • Median transactions per user: x.x

User Segments:
  • Single purchase users: x (x%)
  • Repeat users (2+ purchases): xx (x%)
  • Power users (5+ purchases): y (x%)

Revenue Analysis:
  • Average revenue per user: $xx.xx
  • Median revenue per user: $xx.xx
  • Top 10% of users generate: $xx.xx+ each

============================================================
TRANSACTION PATTERN ANALYSIS
============================================================

Transaction Types:
  • topup: 1xx transactions (xx.x%)
  • purchase: xx transactions (xx.x%)

Revenue Statistics:
  • Total Revenue: $xxx.00
  • Average Transaction: $xx.00
  • Median Transaction: $xx.00

Most Common Transaction Amounts:
  • $10.0: xx transactions
  • $5.0: xx transactions
  • $99.0: xx transactions

============================================================
TREND ANALYSIS
============================================================

Monthly Trends (Last 6 months):
  • 2025-07: xx transactions, xx users, $xxx.00 revenue
  • 2025-08: xx transactions, xx users, $xxx.00 revenue
  • 2025-09: xx transactions, xx users, $xxx.00 revenue
  • 2025-10: xx transactions, xx users, $xxx.00 revenue

============================================================
KEY INSIGHTS & RECOMMENDATIONS
============================================================

Key Insights:
  1. Peak usage occurs on Thursdays at 12:00 PM
  2. Repeat purchase rate is xx.x%
  3. Average transaction value is $xx.xx
  4. Total revenue analyzed: $xxx.xx

Analysis complete! 🎉
```

## Integration with SexyVoice.ai Workflow

These scripts are designed to work with the SexyVoice.ai credit system:

1. **Export data** from Supabase using the provided SQL query
2. **Clean data** using `clean-transactions.py` if needed
3. **Analyze patterns** using `analyze-credit-transactions.py`
4. **Create visuals** using `visualize-transactions.py`
5. **Review insights** to inform business decisions
